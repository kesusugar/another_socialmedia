from __future__ import annotations

import random
from dataclasses import dataclass, field

CATEGORIES = ["tech", "animal", "comedy", "news", "sports"]


@dataclass
class Persona:
    name: str
    description: str
    preferred_categories: dict[str, float]
    behavior_style: str        # "binge" | "picky" | "random"
    active_hours: tuple[int, int]
    fatigue_rate: float        # 0.0 = never fatigues, 1.0 = fatigues fast
    swipe_interval_sec: float


DEFAULT_PERSONAS: dict[str, Persona] = {
    "tech_lover": Persona(
        name="tech_lover",
        description="テック系コンテンツに強い興味を持ち、連続視聴するヘビーユーザー",
        preferred_categories={"tech": 0.85, "news": 0.35, "animal": 0.1, "comedy": 0.1, "sports": 0.1},
        behavior_style="binge",
        active_hours=(9, 23),
        fatigue_rate=0.2,
        swipe_interval_sec=3.0,
    ),
    "animal_fan": Persona(
        name="animal_fan",
        description="動物・ペット動画が大好きで、いいねしやすいライトユーザー",
        preferred_categories={"animal": 0.9, "comedy": 0.45, "tech": 0.1, "news": 0.1, "sports": 0.1},
        behavior_style="binge",
        active_hours=(7, 22),
        fatigue_rate=0.3,
        swipe_interval_sec=5.0,
    ),
    "casual_browser": Persona(
        name="casual_browser",
        description="特に好みなく何でも見るランダム視聴者。飽きやすい",
        preferred_categories={"tech": 0.3, "animal": 0.35, "comedy": 0.4, "news": 0.3, "sports": 0.35},
        behavior_style="random",
        active_hours=(12, 24),
        fatigue_rate=0.6,
        swipe_interval_sec=8.0,
    ),
    "news_junkie": Persona(
        name="news_junkie",
        description="ニュース・テック情報を真剣に追う情報通。スキップが多い",
        preferred_categories={"news": 0.85, "tech": 0.45, "sports": 0.25, "animal": 0.05, "comedy": 0.05},
        behavior_style="picky",
        active_hours=(6, 20),
        fatigue_rate=0.25,
        swipe_interval_sec=6.0,
    ),
    "comedy_fiend": Persona(
        name="comedy_fiend",
        description="お笑い・バズり動画を爆速消費する短期集中型ユーザー",
        preferred_categories={"comedy": 0.9, "animal": 0.5, "sports": 0.25, "tech": 0.05, "news": 0.05},
        behavior_style="binge",
        active_hours=(18, 26),  # 18-2時 (26=翌2時)
        fatigue_rate=0.15,
        swipe_interval_sec=2.0,
    ),
}


def decide_event(
    persona: Persona,
    ad_category: str,
    swipe_count: int,
) -> tuple[str, int, float]:
    """Return (event_type, dwell_ms, completion)."""
    pref = persona.preferred_categories.get(ad_category, 0.1)
    cycle = swipe_count % 20
    fatigue = max(0.0, 1.0 - persona.fatigue_rate * cycle / 20)

    if persona.behavior_style == "binge":
        p_complete = pref * fatigue * 0.65
        p_like = pref * fatigue * 0.20
    elif persona.behavior_style == "picky":
        p_complete = pref * fatigue * 0.50
        p_like = (pref ** 1.5) * fatigue * 0.35
    else:  # random
        p_complete = random.uniform(0.05, 0.45)
        p_like = random.uniform(0.03, 0.18)

    p_complete = min(p_complete, 0.90)
    p_like = min(p_like, 0.50)

    r = random.random()
    if r < p_complete:
        dwell = int(random.gauss(8000, 2000))
        return "complete", max(1000, dwell), round(random.uniform(0.8, 1.0), 2)
    elif r < p_complete + p_like:
        dwell = int(random.gauss(5000, 1500))
        return "like", max(500, dwell), round(random.uniform(0.5, 0.9), 2)
    else:
        dwell = int(random.gauss(900, 400))
        return "skip", max(100, dwell), round(random.uniform(0.0, 0.3), 2)
