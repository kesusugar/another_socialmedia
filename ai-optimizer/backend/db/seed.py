"""Seed 25 ads (5 per category) into the database."""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.crud import get_conn, init_db
from engine.features import CATEGORIES

TITLES: dict[str, list[str]] = {
    "tech":   ["AI最前線", "量子コンピュータ入門", "GPUアーキテクチャ解説",
               "ブロックチェーン実装", "LLM Fine-tuning実践"],
    "animal": ["柴犬の日常", "猫のジャンプ失敗集", "ペンギン水族館ライブ",
               "カワウソのお食事タイム", "アザラシ子育て記録"],
    "comedy": ["滑舌王決定戦", "早口言葉チャレンジ", "大喜利AI対決",
               "コント：面接会場", "ショートコント集"],
    "news":   ["経済ニュースまとめ", "テクノロジートレンド速報", "環境問題最前線",
               "宇宙開発最新情報", "医療イノベーションレポート"],
    "sports": ["サッカーハイライト", "バスケダンクシーン集", "野球珍プレー集",
               "テニス神業スマッシュ", "陸上短距離世界記録"],
}


def make_vector(category: str) -> list[float]:
    idx = CATEGORIES.index(category)
    vec = [random.uniform(0.05, 0.2) for _ in CATEGORIES]
    vec[idx] = random.uniform(0.6, 0.9)
    total = sum(vec)
    return [round(v / total, 4) for v in vec]


def seed() -> None:
    init_db()
    with get_conn() as conn:
        conn.execute("DELETE FROM ads")
        n = 0
        for cat in CATEGORIES:
            for i, title in enumerate(TITLES[cat]):
                ad_id = f"{cat[:3]}_{i + 1:03d}"
                cold = 1 if i == 0 else 0  # first ad per category is cold-start
                vec = make_vector(cat)
                conn.execute(
                    "INSERT OR REPLACE INTO ads"
                    " (ad_id, category, title, thumbnail, vector_json, virtual_bid, cold_start)"
                    " VALUES (?, ?, ?, ?, ?, 1.0, ?)",
                    (
                        ad_id,
                        cat,
                        title,
                        f"http://localhost:8000/static/{ad_id}.mp4",
                        json.dumps(vec),
                        cold,
                    ),
                )
                n += 1
        print(f"Seeded {n} ads across {len(CATEGORIES)} categories.")


if __name__ == "__main__":
    seed()
