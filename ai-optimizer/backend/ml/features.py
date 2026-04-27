from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from engine.features import CATEGORIES, parse_vector

EVENT_TYPE_IDX: dict[str, int] = {
    "impression": 0,
    "complete":   1,
    "like":       2,
    "skip":       3,
}
MAX_DWELL_MS = 30_000.0
SEQ_LEN = 10


def build_ctr_features(
    user_prefs: dict[str, dict[str, float]],
    ad: dict[str, Any],
    hour: int | None = None,
) -> list[float]:
    """Build the 18-dim CTR feature vector for one (user, ad) pair.

    [0:5]  user preference means α/(α+β) per category
    [5:10] ad.vector_json (5 floats)
    [10:15] category one-hot
    [15]   sin(2π * hour / 24)
    [16]   cos(2π * hour / 24)
    [17]   cold_start flag
    """
    if hour is None:
        hour = datetime.now(timezone.utc).hour

    pref_means = [
        user_prefs.get(cat, {"alpha": 1.0, "beta": 1.0})["alpha"]
        / max(
            user_prefs.get(cat, {"alpha": 1.0, "beta": 1.0})["alpha"]
            + user_prefs.get(cat, {"alpha": 1.0, "beta": 1.0})["beta"],
            1e-6,
        )
        for cat in CATEGORIES
    ]

    ad_vec = parse_vector(ad.get("vector_json"))
    if len(ad_vec) != 5:
        ad_vec = [0.2] * 5

    cat_str = ad.get("category", "")
    cat_idx = CATEGORIES.index(cat_str) if cat_str in CATEGORIES else 0
    cat_onehot = [1.0 if i == cat_idx else 0.0 for i in range(5)]

    angle = 2 * math.pi * hour / 24
    time_feats = [math.sin(angle), math.cos(angle)]

    cold = float(bool(ad.get("cold_start", 0)))

    return pref_means + ad_vec + cat_onehot + time_feats + [cold]


def build_session_step(
    ad: dict[str, Any],
    event_type: str,
    dwell_ms: int,
) -> list[float]:
    """Build one 10-float step for the GRU sequence.

    [0:5]  ad.vector_json
    [5:9]  event_type one-hot
    [9]    dwell_ms normalised to [0, 1]
    """
    ad_vec = parse_vector(ad.get("vector_json"))
    if len(ad_vec) != 5:
        ad_vec = [0.2] * 5

    etype_idx = EVENT_TYPE_IDX.get(event_type, 0)
    etype_onehot = [1.0 if i == etype_idx else 0.0 for i in range(4)]

    dwell_norm = min(dwell_ms / MAX_DWELL_MS, 1.0)

    return ad_vec + etype_onehot + [dwell_norm]
