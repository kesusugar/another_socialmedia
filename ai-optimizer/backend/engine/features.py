from __future__ import annotations

import json

CATEGORIES: list[str] = ["tech", "animal", "comedy", "news", "sports"]


def default_prefs() -> dict[str, dict[str, float]]:
    """Return initial Beta(1,1) prefs for all categories."""
    return {cat: {"alpha": 1.0, "beta": 1.0} for cat in CATEGORIES}


def parse_vector(vector_json: str | None) -> list[float]:
    if not vector_json:
        return []
    try:
        return json.loads(vector_json)
    except (json.JSONDecodeError, TypeError):
        return []


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x ** 2 for x in a) ** 0.5
    norm_b = sum(x ** 2 for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
