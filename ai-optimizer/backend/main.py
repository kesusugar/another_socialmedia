from __future__ import annotations

import collections
import math
import random
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import torch
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db.crud import (
    create_ad_for_campaign,
    create_campaign,
    delete_ad,
    delete_campaign,
    ensure_user,
    get_ad,
    get_ad_kpi,
    get_ads_by_campaign,
    get_ads_by_category,
    get_all_campaigns,
    get_campaign,
    get_campaign_kpi,
    get_cold_start_ads,
    get_category_impression_count,
    get_kpi,
    get_recent_cpa_by_category,
    get_user_ad_frequency,
    get_user_prefs,
    get_virtual_bids,
    init_db,
    log_event,
    reset_prefs,
    update_ad,
    update_campaign,
    update_prefs,
    update_virtual_bid,
)
from agent.runner import AgentRunner
from engine.bayesian import BayesianUpdater
from engine.bidding import PIDController
from engine.features import CATEGORIES
from engine.pacing import PacingEngine
from engine.seasonality import SeasonalityConfig, SeasonalityEngine
from engine.thompson import ThompsonSampler
from ml import MLModelStore, ModelTrainer
from ml.features import SEQ_LEN, build_ctr_features, build_session_step

app = FastAPI(title="AI運用最適化シミュレーター", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

torch.set_num_threads(2)

# ── In-memory global state ──────────────────────────────────────────────────

@dataclass
class CategoryOps:
    daily_budget: float = 1000.0
    spent_today:  float = 0.0
    bid_strategy: str   = "manual"
    target_cpa:   float = 500.0
    pid: PIDController = field(default_factory=PIDController)


_eta: float = 0.2
_competition_level: float = 0.0
_ml_strategy: str = "bayesian"  # bayesian | ctr_lr | mf | session_gru

_category_ops: dict[str, CategoryOps] = {cat: CategoryOps() for cat in CATEGORIES}
_pacing  = PacingEngine()
_updater = BayesianUpdater()
_ml_store   = MLModelStore()
_ml_trainer = ModelTrainer(_ml_store)
_server_start: datetime = datetime.now(timezone.utc)
_agent_runner = AgentRunner()
_seasonality_engine = SeasonalityEngine()
_seasonality_config = _seasonality_engine.default_config()
_campaign_impression_wins: dict[str, int] = {}

# GRU session cache: {user_id → deque of 10-float step vectors}
_session_lock: threading.Lock = threading.Lock()
_user_sessions: dict[str, collections.deque] = collections.defaultdict(
    lambda: collections.deque(maxlen=SEQ_LEN)
)


@app.on_event("startup")
def startup() -> None:
    global _server_start
    _server_start = datetime.now(timezone.utc)
    init_db()
    _ml_store.load_all()
    _agent_runner.set_base_url("http://localhost:8000")


# ── Helpers ─────────────────────────────────────────────────────────────────

def _elapsed_hours() -> float:
    return max((datetime.now(timezone.utc) - _server_start).total_seconds() / 3600, 1 / 60)


def _audience_elasticity(category: str) -> float:
    imp = get_category_impression_count(category, since_minutes=1440)
    return max(0.1, 1.0 - 0.1 * math.log1p(imp / 100))


def _fatigue_score(user_id: str, ad_id: str) -> float:
    freq = get_user_ad_frequency(user_id, ad_id)
    return math.exp(-0.05 * freq)


def _ml_score_for_category(
    user_id: str,
    category: str,
    user_prefs: dict[str, dict[str, float]],
    ads_in_cat: list[dict[str, Any]],
) -> float:
    """Return ML-derived score in (0, 1] for one category. Falls back to elasticity."""
    if _ml_strategy == "ctr_lr":
        model = _ml_store.get_ctr()
        if model is None:
            return _audience_elasticity(category)
        scores = []
        for ad in ads_in_cat:
            feat = build_ctr_features(user_prefs, ad)
            x = torch.tensor([feat], dtype=torch.float32)
            scores.append(model.predict_proba(x))
        return max(scores) if scores else _audience_elasticity(category)

    elif _ml_strategy == "mf":
        result = _ml_store.get_mf()
        if result is None:
            return _audience_elasticity(category)
        mf_model, user_to_idx, ad_to_idx = result
        if user_id not in user_to_idx:
            return _audience_elasticity(category)
        uid_idx = user_to_idx[user_id]
        scores = [
            mf_model.predict_proba(uid_idx, ad_to_idx[ad["ad_id"]])
            for ad in ads_in_cat
            if ad["ad_id"] in ad_to_idx
        ]
        return max(scores) if scores else _audience_elasticity(category)

    elif _ml_strategy == "session_gru":
        model = _ml_store.get_gru()
        if model is None:
            return _audience_elasticity(category)
        with _session_lock:
            session = list(_user_sessions.get(user_id, []))
        if len(session) < 3:
            return _audience_elasticity(category)
        seq = torch.tensor([session], dtype=torch.float32).squeeze(0)
        cat_probs = model.predict_category_probs(seq)
        cat_idx = CATEGORIES.index(category) if category in CATEGORIES else 0
        return max(cat_probs[cat_idx], 0.05)

    return _audience_elasticity(category)


# ── Pydantic schemas ────────────────────────────────────────────────────────

class EventLog(BaseModel):
    user_id:    str
    ad_id:      str
    event_type: str = Field(pattern="^(complete|skip|like|impression|lp_click|purchase)$")
    dwell_ms:   int = 0
    completion: float = Field(default=0.0, ge=0.0, le=1.0)


class BidUpdate(BaseModel):
    category: str
    bid:      float = Field(ge=1.0, le=5.0)


class ResetRequest(BaseModel):
    user_id: str | None = None


class EtaUpdate(BaseModel):
    eta: float = Field(ge=0.0, le=1.0)


class CategoryOpsUpdate(BaseModel):
    category:     str
    daily_budget: float | None = Field(default=None, gt=0)
    bid_strategy: str   | None = Field(default=None, pattern="^(manual|tcpa|max_delivery)$")
    target_cpa:   float | None = Field(default=None, gt=0)


class ResetSpendRequest(BaseModel):
    category: str | None = None


class CompetitionUpdate(BaseModel):
    level: float = Field(ge=0.0, le=1.0)


class MLStrategyUpdate(BaseModel):
    strategy: str = Field(pattern="^(bayesian|ctr_lr|mf|session_gru)$")


class AgentStartRequest(BaseModel):
    persona_name: str
    count: int = Field(default=1, ge=1, le=200)


class AgentStopRequest(BaseModel):
    agent_id: str | None = None


class CampaignCreate(BaseModel):
    name:         str
    category:     str
    daily_budget: float = Field(default=1000.0, gt=0)
    bid_strategy: str   = Field(default="manual", pattern="^(manual|tcpa|max_delivery)$")
    target_cpa:   float = Field(default=500.0, gt=0)


class CampaignUpdate(BaseModel):
    name:         str   | None = None
    daily_budget: float | None = Field(default=None, gt=0)
    bid_strategy: str   | None = Field(default=None, pattern="^(manual|tcpa|max_delivery)$")
    target_cpa:   float | None = Field(default=None, gt=0)
    status:       str   | None = Field(default=None, pattern="^(active|paused)$")


class AdCreate(BaseModel):
    campaign_id:  str
    title:        str
    category:     str
    thumbnail:    str   = ""
    vector_json:  str   = "[0.2,0.2,0.2,0.2,0.2]"
    virtual_bid:  float = Field(default=1.0, ge=1.0, le=5.0)
    cold_start:   int   = Field(default=1, ge=0, le=1)


class AdUpdate(BaseModel):
    title:       str   | None = None
    thumbnail:   str   | None = None
    virtual_bid: float | None = Field(default=None, ge=1.0, le=5.0)
    cold_start:  int   | None = Field(default=None, ge=0, le=1)
    vector_json: str   | None = None


class CpaSimulateRequest(BaseModel):
    category:     str
    bid:          float = Field(ge=1.0, le=5.0)
    target_cpa:   float = Field(gt=0)
    bid_strategy: str   = Field(pattern="^(manual|tcpa|max_delivery)$")


class SeasonalityUpdate(BaseModel):
    cpm_by_hour: list[float] | None = None
    ctr_by_hour: list[float] | None = None
    cvr_by_hour: list[float] | None = None
    cpm_by_dow:  list[float] | None = None
    ctr_by_dow:  list[float] | None = None
    cvr_by_dow:  list[float] | None = None
    enabled:     bool       | None = None


# ── /recommend ───────────────────────────────────────────────────────────────

@app.get("/recommend")
def recommend(user_id: str = Query(...)) -> dict[str, Any]:
    ensure_user(user_id)
    prefs = get_user_prefs(user_id)
    bids  = get_virtual_bids()
    elapsed = _elapsed_hours()

    pacing_gains = {
        cat: _pacing.gain(ops.spent_today, ops.daily_budget, elapsed)
        for cat, ops in _category_ops.items()
    }
    max_gain     = max(pacing_gains.values(), default=1.0)
    effective_eta = min(1.0, _eta + _pacing.eta_boost(max_gain))

    sampler = ThompsonSampler(eta=effective_eta)
    raw_ranked = sampler.rank(prefs, virtual_bids=None)

    # Pre-fetch only campaign-linked ads per category
    all_cat_ads: dict[str, list[dict[str, Any]]] = {
        cat: [a for a in get_ads_by_category(cat) if a.get("campaign_id")]
        for cat in CATEGORIES
    }

    best_category = CATEGORIES[0]
    best_score    = -1.0
    ml_score_best = 1.0

    for cat, raw_sample in raw_ranked:
        ops      = _category_ops[cat]
        pacing   = pacing_gains[cat]
        ml_score = _ml_score_for_category(user_id, cat, prefs, all_cat_ads[cat])

        if ops.bid_strategy == "max_delivery":
            effective_bid = 5.0
        elif ops.bid_strategy == "tcpa":
            actual_cpa = get_recent_cpa_by_category(cat, minutes=30)
            delta      = ops.pid.update(actual_cpa, ops.target_cpa) if actual_cpa > 0 else 0.0
            effective_bid = max(0.5, min(5.0, bids.get(cat, 1.0) - delta * 0.01))
        else:
            effective_bid = bids.get(cat, 1.0)

        s_mult = _seasonality_engine.get_multipliers(
            _seasonality_config, datetime.now(timezone.utc)
        )
        final_score = raw_sample * effective_bid * pacing * ml_score * s_mult["ctr"]
        if final_score > best_score:
            best_score    = final_score
            best_category = cat
            ml_score_best = ml_score

    # Cold-start for brand-new users (campaign ads only)
    all_default = all(p["alpha"] == 1.0 and p["beta"] == 1.0 for p in prefs.values())
    if all_default:
        cold = [a for a in get_cold_start_ads(limit=5) if a.get("campaign_id")]
        filtered = [a for a in cold if a["category"] == best_category]
        ads = filtered or cold
    else:
        ads = all_cat_ads[best_category]

    if not ads:
        return {
            "ad_id": "", "category": "organic", "title": "", "thumbnail": "",
            "score": 0.0, "is_organic": True, "cvr_rate": 0.0,
            "sampled_at": datetime.now(timezone.utc).isoformat(),
        }

    ad = max(ads, key=lambda a: _fatigue_score(user_id, a["ad_id"]) * random.random())
    freq           = get_user_ad_frequency(user_id, ad["ad_id"])
    fatigue_penalty = round(1.0 - math.exp(-0.3 * freq), 4)
    elasticity_val  = _audience_elasticity(best_category)

    s_mult = _seasonality_engine.get_multipliers(
        _seasonality_config, datetime.now(timezone.utc)
    )
    _category_ops[best_category].spent_today += bids.get(best_category, 1.0) * s_mult["cpm"]

    # Track per-campaign impression wins
    campaign_id = ad.get("campaign_id") or ""
    if campaign_id:
        _campaign_impression_wins[campaign_id] = _campaign_impression_wins.get(campaign_id, 0) + 1

    # Lookup CVR rate for this ad's campaign
    cvr_rate = 0.005
    if campaign_id:
        cmp = get_campaign(campaign_id)
        if cmp:
            cvr_rate = cmp.get("cvr_rate") or 0.005

    return {
        "ad_id":    ad["ad_id"],
        "category": ad["category"],
        "title":    ad.get("title", ""),
        "thumbnail": ad.get("thumbnail", ""),
        "score":    round(best_score, 4),
        "is_organic": False,
        "cvr_rate": cvr_rate,
        "debug": {
            "pacing_gain":       round(pacing_gains[best_category], 3),
            "effective_eta":     round(effective_eta, 3),
            "fatigue_penalty":   fatigue_penalty,
            "elasticity":        round(elasticity_val, 3),
            "bid_strategy":      _category_ops[best_category].bid_strategy,
            "model_used":        _ml_strategy,
            "ml_score":          round(ml_score_best, 4),
            "seasonality_ctr":   round(s_mult["ctr"], 4),
            "seasonality_cpm":   round(s_mult["cpm"], 4),
        },
        "sampled_at": datetime.now(timezone.utc).isoformat(),
    }


# ── /event ───────────────────────────────────────────────────────────────────

@app.post("/event")
def receive_event(body: EventLog) -> dict[str, str]:
    ensure_user(body.user_id)
    ad = get_ad(body.ad_id)
    if ad:
        category   = ad["category"]
        prefs      = get_user_prefs(body.user_id)
        cat_params = prefs.get(category, {"alpha": 1.0, "beta": 1.0})
        updated    = _updater.update(cat_params, body.event_type)
        update_prefs(body.user_id, category, updated["alpha"], updated["beta"])

        # Append to GRU session cache
        step = build_session_step(ad, body.event_type, body.dwell_ms)
        with _session_lock:
            _user_sessions[body.user_id].append(step)

        # Probabilistic purchase on lp_click
        if body.event_type == "lp_click" and ad.get("campaign_id"):
            cmp = get_campaign(ad["campaign_id"])
            if cmp and random.random() < (cmp.get("cvr_rate") or 0.005):
                log_event(body.user_id, body.ad_id, "purchase", 0, 0.0)

    log_event(body.user_id, body.ad_id, body.event_type, body.dwell_ms, body.completion)
    _ml_trainer.notify_new_event()
    return {"status": "ok"}


# ── /user/{id}/profile ────────────────────────────────────────────────────────

@app.get("/user/{user_id}/profile")
def user_profile(user_id: str) -> dict[str, Any]:
    ensure_user(user_id)
    prefs = get_user_prefs(user_id)
    bids  = get_virtual_bids()
    sampler = ThompsonSampler(eta=_eta)
    ranked  = sampler.rank(prefs, virtual_bids=bids)
    dominant = ranked[0][0] if ranked else CATEGORIES[0]
    return {
        "user_id":          user_id,
        "dominant_category": dominant,
        "preferences":      prefs,
        "eta":              _eta,
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
    if _competition_level > 0:
        for pt in data["timeline"]:
            pt["cpa"] = round(pt["cpa"] * (1 + _competition_level), 2)
    data["competition_level"] = _competition_level
    return data


# ── /admin/category-ops ───────────────────────────────────────────────────────

@app.get("/admin/category-ops")
def get_category_ops_all() -> dict[str, Any]:
    elapsed = _elapsed_hours()
    return {
        cat: {
            "daily_budget":  ops.daily_budget,
            "spent_today":   round(ops.spent_today, 2),
            "bid_strategy":  ops.bid_strategy,
            "target_cpa":    ops.target_cpa,
            "pacing_gain":   round(_pacing.gain(ops.spent_today, ops.daily_budget, elapsed), 3),
            "pacing_ratio":  _pacing.pacing_ratio(ops.spent_today, ops.daily_budget, elapsed),
            "pid_state":     ops.pid.state(),
        }
        for cat, ops in _category_ops.items()
    }


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


# ── /admin/ml/* ───────────────────────────────────────────────────────────────

@app.get("/admin/ml/status")
def get_ml_status() -> dict[str, Any]:
    return {
        "active_strategy": _ml_strategy,
        "models":          _ml_store.get_all_status(),
    }


@app.get("/admin/ml/strategy")
def get_ml_strategy() -> dict[str, str]:
    return {"strategy": _ml_strategy}


@app.put("/admin/ml/strategy")
def set_ml_strategy(body: MLStrategyUpdate) -> dict[str, str]:
    global _ml_strategy
    _ml_strategy = body.strategy
    return {"status": "ok", "strategy": _ml_strategy}


@app.post("/admin/ml/train")
def trigger_training() -> dict[str, str]:
    threading.Thread(target=_ml_trainer._train_all, daemon=True).start()
    return {"status": "training_started"}


# ── /admin/agents ─────────────────────────────────────────────────────────────

@app.get("/admin/agents/personas")
def get_personas() -> list[dict]:
    return _agent_runner.available_personas()


@app.get("/admin/agents/status")
def get_agents_status() -> list[dict]:
    _agent_runner.cleanup_stopped()
    return _agent_runner.status()


@app.post("/admin/agents/start")
def start_agents(body: AgentStartRequest) -> dict[str, Any]:
    try:
        ids = _agent_runner.start(body.persona_name, body.count)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "started": ids}


@app.post("/admin/agents/stop")
def stop_agents(body: AgentStopRequest) -> dict[str, Any]:
    if body.agent_id:
        ok = _agent_runner.stop(body.agent_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Agent not found")
        return {"status": "ok", "stopped": body.agent_id}
    count = _agent_runner.stop_all()
    return {"status": "ok", "stopped_count": count}


# ── /admin/seasonality ────────────────────────────────────────────────────────

@app.get("/admin/seasonality")
def get_seasonality() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    mults = _seasonality_engine.get_multipliers(_seasonality_config, now)
    return {
        **_seasonality_config.to_dict(),
        "current_hour": now.hour,
        "current_dow": now.weekday(),
        "current_multipliers": mults,
    }


@app.put("/admin/seasonality")
def update_seasonality(body: SeasonalityUpdate) -> dict[str, Any]:
    global _seasonality_config
    d = _seasonality_config.to_dict()
    for field_name, val in body.model_dump(exclude_none=True).items():
        if field_name in d:
            if isinstance(val, list):
                expected = 24 if "hour" in field_name else 7
                if len(val) != expected:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{field_name} must have {expected} elements",
                    )
            d[field_name] = val
    _seasonality_config = SeasonalityConfig.from_dict(d)
    return {"status": "ok", **_seasonality_config.to_dict()}


@app.post("/admin/seasonality/reset")
def reset_seasonality() -> dict[str, Any]:
    global _seasonality_config
    _seasonality_config = _seasonality_engine.default_config()
    return {"status": "reset", **_seasonality_config.to_dict()}


# ── /admin/portfolio/simulate ─────────────────────────────────────────────────

@app.get("/admin/portfolio/simulate")
def portfolio_simulate(
    category:   str   = Query(...),
    target_cpa: float = Query(..., gt=0),
    budget:     float = Query(default=10000.0, gt=0),
    minutes:    int   = Query(default=60, ge=1, le=1440),
) -> dict[str, Any]:
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {category}")

    kpi_data = get_kpi(minutes)
    timeline = kpi_data["timeline"]
    avg_ctr = sum(p["ctr"] for p in timeline) / len(timeline) if timeline else 0.025
    avg_cvr = sum(p["cvr"] for p in timeline) / len(timeline) if timeline else 0.005
    avg_ctr = max(avg_ctr, 0.001)
    avg_cvr = max(avg_cvr, 0.001)

    s_mult  = _seasonality_engine.get_multipliers(_seasonality_config, datetime.now(timezone.utc))
    eff_ctr = avg_ctr * s_mult["ctr"]
    eff_cvr = avg_cvr * s_mult["cvr"]

    # Base CPM estimated from competition & bids
    bids     = get_virtual_bids()
    base_bid = bids.get(category, 1.0) * (1 + _competition_level)
    base_cpm = base_bid * 200 * s_mult["cpm"]   # rough CPM model: bid × 200

    base_cpa = base_cpm / (1000 * max(eff_ctr * eff_cvr, 1e-6))

    results = []
    best_point = None
    best_cpa   = float("inf")

    for i in range(11):   # MD ratio 0% → 100% in 10% steps
        md_ratio = i / 10.0
        cc_ratio = 1.0 - md_ratio

        # MD: bid=5.0 → wins more auctions, CPM rises ~50%, CTR boost ~20%
        md_cpm_mult = 1.5
        md_ctr_mult = 1.2
        md_cpa  = base_cpa * md_cpm_mult / md_ctr_mult
        md_imp  = (budget * md_ratio) / max(base_cpm * md_cpm_mult / 1000, 1e-6)

        # CC: target_cpa → ~70% auction win rate, CPA 5% over target
        cc_win  = 0.7
        cc_cpa  = target_cpa * 1.05
        cc_imp  = (budget * cc_ratio * cc_win) / max(base_cpm / 1000, 1e-6)

        p_cpa = md_ratio * md_cpa + cc_ratio * cc_cpa if (md_ratio + cc_ratio) > 0 else cc_cpa
        p_imp = md_imp + cc_imp
        p_cv  = p_imp * eff_ctr * eff_cvr

        point = {
            "md_ratio":      round(md_ratio, 1),
            "cc_ratio":      round(cc_ratio, 1),
            "estimated_cpa": round(p_cpa, 0),
            "estimated_imp": round(p_imp, 0),
            "estimated_cv":  round(p_cv, 1),
        }
        results.append(point)

        if p_cpa < best_cpa:
            best_cpa   = p_cpa
            best_point = point

    return {
        "results":          results,
        "recommended":      best_point,
        "base_cpa":         round(base_cpa, 0),
        "avg_ctr":          round(avg_ctr, 4),
        "avg_cvr":          round(avg_cvr, 4),
        "seasonality_active": _seasonality_config.enabled,
        "current_multipliers": s_mult,
        "note": "過去実績ベース近似モデル" if timeline else "実績データなし — デフォルト値使用",
    }


# ── /admin/campaigns/impression-share ────────────────────────────────────────

@app.get("/admin/campaigns/impression-share")
def get_impression_share() -> dict[str, Any]:
    campaigns = get_all_campaigns()
    by_category: dict[str, list] = {}
    for cat in CATEGORIES:
        cat_camps = [c for c in campaigns if c["category"] == cat and c.get("status") == "active"]
        if not cat_camps:
            continue
        total = sum(_campaign_impression_wins.get(c["campaign_id"], 0) for c in cat_camps)
        entries = []
        for c in cat_camps:
            wins = _campaign_impression_wins.get(c["campaign_id"], 0)
            entries.append({
                "campaign_id": c["campaign_id"],
                "name":        c["name"],
                "wins":        wins,
                "share":       round(wins / total, 3) if total > 0 else 0.0,
            })
        by_category[cat] = sorted(entries, key=lambda x: x["wins"], reverse=True)
    return {"by_category": by_category, "total_wins": dict(_campaign_impression_wins)}


# ── /admin/events/live ───────────────────────────────────────────────────────

@app.get("/admin/events/live")
def events_live(limit: int = 50, since_id: int = 0):
    import traceback as _tb
    try:
        with get_conn() as conn:
            rows = conn.execute(
                """
                SELECT e.id, e.created_at, e.user_id, e.ad_id, e.event_type, e.dwell_ms,
                       a.title as ad_title, c.name as campaign_name
                FROM events e
                JOIN ads a ON e.ad_id = a.ad_id
                LEFT JOIN campaigns c ON a.campaign_id = c.campaign_id
                WHERE e.id > ?
                ORDER BY e.id DESC
                LIMIT ?
                """,
                (since_id, limit),
            ).fetchall()
            return [{k: row[k] for k in row.keys()} for row in rows]
    except Exception as exc:
        return {"error": str(exc), "trace": _tb.format_exc()}


# ── /health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── /advertiser/campaigns ────────────────────────────────────────────────────

@app.get("/advertiser/campaigns")
def list_campaigns() -> list[dict[str, Any]]:
    campaigns = get_all_campaigns()
    for cmp in campaigns:
        ads = get_ads_by_campaign(cmp["campaign_id"])
        cmp["ad_count"] = len(ads)
        kpi = get_campaign_kpi(cmp["campaign_id"], minutes=1440)
        cmp["total_impressions"] = kpi["total_impressions"]
        cmp["overall_ctr"] = kpi["overall_ctr"]
        cmp["overall_cpa_yen"] = kpi["overall_cpa_yen"]
    return campaigns


@app.post("/advertiser/campaigns", status_code=201)
def create_campaign_endpoint(body: CampaignCreate) -> dict[str, Any]:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")
    campaign_id = create_campaign(
        name=body.name,
        category=body.category,
        daily_budget=body.daily_budget,
        bid_strategy=body.bid_strategy,
        target_cpa=body.target_cpa,
    )
    return {"status": "created", "campaign_id": campaign_id}


@app.get("/advertiser/campaigns/{campaign_id}")
def get_campaign_endpoint(campaign_id: str) -> dict[str, Any]:
    cmp = get_campaign(campaign_id)
    if not cmp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    cmp["ads"] = get_ads_by_campaign(campaign_id)
    return cmp


@app.put("/advertiser/campaigns/{campaign_id}")
def update_campaign_endpoint(campaign_id: str, body: CampaignUpdate) -> dict[str, str]:
    if not get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    updates = body.model_dump(exclude_none=True)
    update_campaign(campaign_id, **updates)
    return {"status": "ok"}


@app.delete("/advertiser/campaigns/{campaign_id}")
def delete_campaign_endpoint(campaign_id: str) -> dict[str, str]:
    if not get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    delete_campaign(campaign_id)
    return {"status": "deleted"}


# ── /advertiser/campaigns/{id}/ads & kpi ─────────────────────────────────────

@app.get("/advertiser/campaigns/{campaign_id}/ads")
def list_campaign_ads(campaign_id: str) -> list[dict[str, Any]]:
    if not get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return get_ads_by_campaign(campaign_id)


@app.get("/advertiser/campaigns/{campaign_id}/kpi")
def campaign_kpi(
    campaign_id: str,
    minutes: int = Query(default=60, ge=1, le=1440),
) -> dict[str, Any]:
    if not get_campaign(campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    return get_campaign_kpi(campaign_id, minutes)


# ── /advertiser/ads ───────────────────────────────────────────────────────────

@app.post("/advertiser/ads", status_code=201)
def create_ad_endpoint(body: AdCreate) -> dict[str, Any]:
    if not get_campaign(body.campaign_id):
        raise HTTPException(status_code=404, detail="Campaign not found")
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")
    ad_id = create_ad_for_campaign(
        campaign_id=body.campaign_id,
        title=body.title,
        category=body.category,
        thumbnail=body.thumbnail,
        vector_json=body.vector_json,
        virtual_bid=body.virtual_bid,
        cold_start=body.cold_start,
    )
    return {"status": "created", "ad_id": ad_id}


@app.put("/advertiser/ads/{ad_id}")
def update_ad_endpoint(ad_id: str, body: AdUpdate) -> dict[str, str]:
    if not get_ad(ad_id):
        raise HTTPException(status_code=404, detail="Ad not found")
    updates = body.model_dump(exclude_none=True)
    update_ad(ad_id, **updates)
    return {"status": "ok"}


@app.delete("/advertiser/ads/{ad_id}")
def delete_ad_endpoint(ad_id: str) -> dict[str, str]:
    if not get_ad(ad_id):
        raise HTTPException(status_code=404, detail="Ad not found")
    delete_ad(ad_id)
    return {"status": "deleted"}


@app.get("/advertiser/ads/{ad_id}/kpi")
def ad_kpi(
    ad_id: str,
    minutes: int = Query(default=60, ge=1, le=1440),
) -> dict[str, Any]:
    if not get_ad(ad_id):
        raise HTTPException(status_code=404, detail="Ad not found")
    return get_ad_kpi(ad_id, minutes)


# ── /advertiser/simulate/cpa ──────────────────────────────────────────────────

@app.post("/advertiser/simulate/cpa")
def simulate_cpa(body: CpaSimulateRequest) -> dict[str, Any]:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")

    from db.crud import CATEGORY_CPM_YEN, DEFAULT_CPM_YEN
    kpi_data = get_kpi(minutes=60)
    timeline = kpi_data["timeline"]
    if timeline:
        avg_ctr = sum(p["ctr"] for p in timeline) / len(timeline)
        avg_cvr = sum(p["cvr"] for p in timeline) / len(timeline)
    else:
        avg_ctr, avg_cvr = 0.025, 0.005

    cpm_yen = CATEGORY_CPM_YEN.get(body.category, DEFAULT_CPM_YEN)
    bid_boost = 1.0 + (body.bid - 1.0) * 0.08
    est_ctr   = min(avg_ctr * bid_boost, 1.0)
    est_cvr   = max(avg_cvr, 0.001)
    est_cpa   = cpm_yen / (1000 * est_ctr * est_cvr) * (1.0 + _competition_level)

    gap = body.target_cpa - est_cpa
    feasible = gap >= 0

    return {
        "estimated_cpa":    round(est_cpa, 0),
        "estimated_ctr":    round(est_ctr, 4),
        "estimated_cvr":    round(est_cvr, 4),
        "target_cpa":       body.target_cpa,
        "gap":              round(gap, 0),
        "feasible":         feasible,
        "competition_level": _competition_level,
        "note":             "過去60分の実績ベース推定値" if timeline else "実績データなし — デフォルト値使用",
    }
