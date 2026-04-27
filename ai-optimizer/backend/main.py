from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db.crud import (
    ensure_user,
    get_ad,
    get_ads_by_category,
    get_cold_start_ads,
    get_kpi,
    get_user_prefs,
    get_virtual_bids,
    init_db,
    log_event,
    reset_prefs,
    update_prefs,
    update_virtual_bid,
)
from engine.bayesian import BayesianUpdater
from engine.features import CATEGORIES
from engine.thompson import ThompsonSampler

app = FastAPI(title="AI運用最適化シミュレーター", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global mutable state (in-memory, no restart needed for η changes)
_eta: float = 0.2
_updater = BayesianUpdater()


@app.on_event("startup")
def startup() -> None:
    init_db()


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


# ── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/recommend")
def recommend(user_id: str = Query(...)) -> dict[str, Any]:
    ensure_user(user_id)
    prefs = get_user_prefs(user_id)
    bids = get_virtual_bids()

    sampler = ThompsonSampler(eta=_eta)
    best_category, score = sampler.sample(prefs, virtual_bids=bids)

    # For new users (all prefs at default 1/1) bias toward cold-start content
    all_default = all(
        p["alpha"] == 1.0 and p["beta"] == 1.0 for p in prefs.values()
    )
    if all_default:
        cold_ads = get_cold_start_ads(limit=5)
        cat_cold = [a for a in cold_ads if a["category"] == best_category]
        ads = cat_cold or cold_ads
    else:
        ads = get_ads_by_category(best_category)

    if not ads:
        raise HTTPException(status_code=404, detail="No ads available")

    import random
    ad = random.choice(ads)

    return {
        "ad_id": ad["ad_id"],
        "category": ad["category"],
        "title": ad.get("title", ""),
        "thumbnail": ad.get("thumbnail", ""),
        "score": round(score, 4),
        "sampled_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/event")
def receive_event(body: EventLog) -> dict[str, str]:
    ensure_user(body.user_id)

    # Determine category for the ad
    ad = get_ad(body.ad_id)
    if ad:
        category = ad["category"]
        prefs = get_user_prefs(body.user_id)
        cat_params = prefs.get(category, {"alpha": 1.0, "beta": 1.0})
        updated = _updater.update(cat_params, body.event_type)
        update_prefs(body.user_id, category, updated["alpha"], updated["beta"])

    log_event(
        body.user_id,
        body.ad_id,
        body.event_type,
        body.dwell_ms,
        body.completion,
    )
    return {"status": "ok"}


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


@app.post("/admin/bid")
def set_bid(body: BidUpdate) -> dict[str, str]:
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category: {body.category}")
    update_virtual_bid(body.category, body.bid)
    return {"status": "ok", "category": body.category, "bid": str(body.bid)}


@app.post("/admin/reset")
def reset(body: ResetRequest) -> dict[str, str]:
    reset_prefs(body.user_id)
    target = body.user_id or "all users"
    return {"status": "ok", "reset": target}


@app.put("/admin/eta")
def set_eta(body: EtaUpdate) -> dict[str, Any]:
    global _eta
    _eta = body.eta
    return {"status": "ok", "eta": _eta}


@app.get("/admin/eta")
def get_eta() -> dict[str, float]:
    return {"eta": _eta}


@app.get("/admin/kpi")
def kpi(minutes: int = Query(default=60, ge=1, le=1440)) -> dict[str, Any]:
    return get_kpi(minutes)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
