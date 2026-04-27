from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db.crud import (
    ensure_user,
    get_ad,
    get_ads_by_category,
    get_category_impression_count,
    get_cold_start_ads,
    get_kpi,
    get_recent_cpa_by_category,
    get_user_ad_frequency,
    get_user_prefs,
    get_virtual_bids,
    init_db,
    log_event,
    reset_prefs,
    update_prefs,
    update_virtual_bid,
)
from engine.bayesian import BayesianUpdater
from engine.bidding import PIDController
from engine.features import CATEGORIES
from engine.pacing import PacingEngine
from engine.thompson import ThompsonSampler

app = FastAPI(title="AI運用最適化シミュレーター", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory global state ──────────────────────────────────────────────────

@dataclass
class CategoryOps:
    daily_budget: float = 1000.0
    spent_today: float = 0.0
    bid_strategy: str = "manual"   # 'manual' | 'tcpa' | 'max_delivery'
    target_cpa: float = 500.0
    pid: PIDController = field(default_factory=PIDController)


_eta: float = 0.2
_competition_level: float = 0.0   # 0=no competition, 1=fierce
_category_ops: dict[str, CategoryOps] = {cat: CategoryOps() for cat in CATEGORIES}
_pacing = PacingEngine()
_updater = BayesianUpdater()
_server_start: datetime = datetime.now(timezone.utc)


@app.on_event("startup")
def startup() -> None:
    global _server_start
    _server_start = datetime.now(timezone.utc)
    init_db()


# ── Helpers ─────────────────────────────────────────────────────────────────

def _elapsed_hours() -> float:
    return max(
        (datetime.now(timezone.utc) - _server_start).total_seconds() / 3600,
        1 / 60,
    )


def _audience_elasticity(category: str) -> float:
    """Diminishing returns: more impressions → lower eCVR multiplier."""
    imp = get_category_impression_count(category, since_minutes=1440)
    return max(0.1, 1.0 - 0.1 * math.log1p(imp / 100))


def _fatigue_score(user_id: str, ad_id: str) -> float:
    freq = get_user_ad_frequency(user_id, ad_id)
    return math.exp(-0.3 * freq)


# ── Pydantic schemas ────────────────────────────────────────────────────────

class EventLog(BaseModel):
    user_id: str
    ad_id: str
    event_type: str = Field(pattern="^(complete|skip|like|impression)$")
    dwell_ms: int = 0
    completion: float = Field(default=0.0, ge=0.0, le=1.0)


class BidUpdate(BaseModel):
    category: str
    bid: float = Field(ge=1.0, le=5.0)


class ResetRequest(BaseModel):
    user_id: str | None = None


class EtaUpdate(BaseModel):
    eta: float = Field(ge=0.0, le=1.0)


class CategoryOpsUpdate(BaseModel):
    category: str
    daily_budget: float | None = Field(default=None, gt=0)
    bid_strategy: str | None = Field(default=None, pattern="^(manual|tcpa|max_delivery)$")
    target_cpa: float | None = Field(default=None, gt=0)


class ResetSpendRequest(BaseModel):
    category: str | None = None


class CompetitionUpdate(BaseModel):
    level: float = Field(ge=0.0, le=1.0)


# ── /recommend ───────────────────────────────────────────────────────────────

@app.get("/recommend")
def recommend(user_id: str = Query(...)) -> dict[str, Any]:
    ensure_user(user_id)
    prefs = get_user_prefs(user_id)
    bids = get_virtual_bids()
    elapsed = _elapsed_hours()

    # Compute per-category pacing gains; derive effective eta
    pacing_gains = {
        cat: _pacing.gain(ops.spent_today, ops.daily_budget, elapsed)
        for cat, ops in _category_ops.items()
    }
    max_gain = max(pacing_gains.values(), default=1.0)
    effective_eta = min(1.0, _eta + _pacing.eta_boost(max_gain))

    # Thompson sampling (raw samples, no bid — bids applied manually below)
    sampler = ThompsonSampler(eta=effective_eta)
    raw_ranked = sampler.rank(prefs, virtual_bids=None)

    # Score every category with all modifiers applied
    best_category = CATEGORIES[0]
    best_score = -1.0

    for cat, raw_sample in raw_ranked:
        ops = _category_ops[cat]
        elasticity = _audience_elasticity(cat)
        pacing = pacing_gains[cat]

        if ops.bid_strategy == "max_delivery":
            effective_bid = 5.0
        elif ops.bid_strategy == "tcpa":
            actual_cpa = get_recent_cpa_by_category(cat, minutes=30)
            delta = ops.pid.update(actual_cpa, ops.target_cpa) if actual_cpa > 0 else 0.0
            effective_bid = max(0.5, min(5.0, bids.get(cat, 1.0) - delta * 0.01))
        else:
            effective_bid = bids.get(cat, 1.0)

        final_score = raw_sample * effective_bid * pacing * elasticity
        if final_score > best_score:
            best_score = final_score
            best_category = cat

    # Cold-start override for brand-new users
    all_default = all(p["alpha"] == 1.0 and p["beta"] == 1.0 for p in prefs.values())
    if all_default:
        cold = get_cold_start_ads(limit=5)
        filtered = [a for a in cold if a["category"] == best_category]
        ads = filtered or cold
    else:
        ads = get_ads_by_category(best_category)

    if not ads:
        raise HTTPException(status_code=404, detail="No ads available")

    # Pick ad penalizing creative fatigue
    ad = max(ads, key=lambda a: _fatigue_score(user_id, a["ad_id"]) * random.random())
    freq = get_user_ad_frequency(user_id, ad["ad_id"])
    fatigue_penalty = round(1.0 - math.exp(-0.3 * freq), 4)
    elasticity_val = _audience_elasticity(best_category)

    # Charge virtual cost
    _category_ops[best_category].spent_today += bids.get(best_category, 1.0)

    return {
        "ad_id": ad["ad_id"],
        "category": ad["category"],
        "title": ad.get("title", ""),
        "thumbnail": ad.get("thumbnail", ""),
        "score": round(best_score, 4),
        "debug": {
            "pacing_gain": round(pacing_gains[best_category], 3),
            "effective_eta": round(effective_eta, 3),
            "fatigue_penalty": fatigue_penalty,
            "elasticity": round(elasticity_val, 3),
            "bid_strategy": _category_ops[best_category].bid_strategy,
        },
        "sampled_at": datetime.now(timezone.utc).isoformat(),
    }


# ── /event ───────────────────────────────────────────────────────────────────

@app.post("/event")
def receive_event(body: EventLog) -> dict[str, str]:
    ensure_user(body.user_id)
    ad = get_ad(body.ad_id)
    if ad:
        category = ad["category"]
        prefs = get_user_prefs(body.user_id)
        cat_params = prefs.get(category, {"alpha": 1.0, "beta": 1.0})
        updated = _updater.update(cat_params, body.event_type)
        update_prefs(body.user_id, category, updated["alpha"], updated["beta"])
    log_event(body.user_id, body.ad_id, body.event_type, body.dwell_ms, body.completion)
    return {"status": "ok"}


# ── /user/{id}/profile ────────────────────────────────────────────────────────

@app.get("/user/{user_id}/profile")
def user_profile(user_id: str) -> dict[str, Any]:
    ensure_user(user_id)
    prefs = get_user_prefs(user_id)
    bids = get_virtual_bids()
    sampler = ThompsonSampler(eta=_eta)
    ranked = sampler.rank(prefs, virtual_bids=bids)
    dominant = ranked[0][0] if ranked else CATEGORIES[0]
    return {
        "user_id": user_id,
        "dominant_category": dominant,
        "preferences": prefs,
        "eta": _eta,
    }


# ── /admin/bid ────────────────────────────────────────────────────────────────

@app.post("/admin/bid")
def set_bid(body: BidUpdate) -> dict[str, str]:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")
    update_virtual_bid(body.category, body.bid)
    return {"status": "ok", "category": body.category, "bid": str(body.bid)}


# ── /admin/reset ──────────────────────────────────────────────────────────────

@app.post("/admin/reset")
def reset(body: ResetRequest) -> dict[str, str]:
    reset_prefs(body.user_id)
    return {"status": "ok", "reset": body.user_id or "all users"}


# ── /admin/eta ────────────────────────────────────────────────────────────────

@app.put("/admin/eta")
def set_eta(body: EtaUpdate) -> dict[str, Any]:
    global _eta
    _eta = body.eta
    return {"status": "ok", "eta": _eta}


@app.get("/admin/eta")
def get_eta() -> dict[str, float]:
    return {"eta": _eta}


# ── /admin/kpi ────────────────────────────────────────────────────────────────

@app.get("/admin/kpi")
def kpi(minutes: int = Query(default=60, ge=1, le=1440)) -> dict[str, Any]:
    data = get_kpi(minutes)
    # Apply competition-level CPA uplift
    if _competition_level > 0:
        for point in data["timeline"]:
            point["cpa"] = round(point["cpa"] * (1 + _competition_level), 2)
    data["competition_level"] = _competition_level
    return data


# ── /admin/category-ops ───────────────────────────────────────────────────────

@app.get("/admin/category-ops")
def get_category_ops_all() -> dict[str, Any]:
    elapsed = _elapsed_hours()
    result = {}
    for cat, ops in _category_ops.items():
        gain = _pacing.gain(ops.spent_today, ops.daily_budget, elapsed)
        ratio = _pacing.pacing_ratio(ops.spent_today, ops.daily_budget, elapsed)
        result[cat] = {
            "daily_budget": ops.daily_budget,
            "spent_today": round(ops.spent_today, 2),
            "bid_strategy": ops.bid_strategy,
            "target_cpa": ops.target_cpa,
            "pacing_gain": round(gain, 3),
            "pacing_ratio": ratio,
            "pid_state": ops.pid.state(),
        }
    return result


@app.post("/admin/category-ops")
def update_category_ops(body: CategoryOpsUpdate) -> dict[str, Any]:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")
    ops = _category_ops[body.category]
    if body.daily_budget is not None:
        ops.daily_budget = body.daily_budget
    if body.bid_strategy is not None:
        ops.bid_strategy = body.bid_strategy
        ops.pid.reset()
    if body.target_cpa is not None:
        ops.target_cpa = body.target_cpa
    return {"status": "ok", "category": body.category}


@app.post("/admin/category-ops/reset-spend")
def reset_spend(body: ResetSpendRequest) -> dict[str, str]:
    targets = [body.category] if body.category else list(CATEGORIES)
    for cat in targets:
        if cat in _category_ops:
            _category_ops[cat].spent_today = 0.0
            _category_ops[cat].pid.reset()
    return {"status": "ok", "reset": body.category or "all"}


# ── /admin/competition ────────────────────────────────────────────────────────

@app.get("/admin/competition")
def get_competition() -> dict[str, float]:
    return {"level": _competition_level}


@app.put("/admin/competition")
def set_competition(body: CompetitionUpdate) -> dict[str, Any]:
    global _competition_level
    _competition_level = body.level
    return {"status": "ok", "level": _competition_level}


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
