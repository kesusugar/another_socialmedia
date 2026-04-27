from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from engine.features import CATEGORIES, default_prefs

DB_PATH = Path(__file__).parent / "simulator.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    schema = (Path(__file__).parent / "schema.sql").read_text()
    with get_conn() as conn:
        conn.executescript(schema)


# ── Users ──────────────────────────────────────────────────────────────────

def ensure_user(user_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id) VALUES (?)", (user_id,)
        )
        for category in CATEGORIES:
            conn.execute(
                "INSERT OR IGNORE INTO user_preferences(user_id, category, alpha, beta)"
                " VALUES (?, ?, 1.0, 1.0)",
                (user_id, category),
            )


def get_user_prefs(user_id: str) -> dict[str, dict[str, float]]:
    ensure_user(user_id)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT category, alpha, beta FROM user_preferences WHERE user_id=?",
            (user_id,),
        ).fetchall()
    if not rows:
        return default_prefs()
    return {r["category"]: {"alpha": r["alpha"], "beta": r["beta"]} for r in rows}


def update_prefs(user_id: str, category: str, alpha: float, beta: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO user_preferences(user_id, category, alpha, beta)"
            " VALUES (?, ?, ?, ?)"
            " ON CONFLICT(user_id, category) DO UPDATE SET"
            " alpha=excluded.alpha, beta=excluded.beta,"
            " updated_at=CURRENT_TIMESTAMP",
            (user_id, category, alpha, beta),
        )


def reset_prefs(user_id: str | None = None) -> None:
    with get_conn() as conn:
        if user_id:
            conn.execute(
                "UPDATE user_preferences SET alpha=1.0, beta=1.0,"
                " updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                (user_id,),
            )
        else:
            conn.execute(
                "UPDATE user_preferences SET alpha=1.0, beta=1.0,"
                " updated_at=CURRENT_TIMESTAMP"
            )


# ── Ads ────────────────────────────────────────────────────────────────────

def get_ads_by_category(category: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ads WHERE category=? ORDER BY RANDOM() LIMIT 5",
            (category,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_cold_start_ads(limit: int = 5) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ads WHERE cold_start=1 LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_ad(ad_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ads WHERE ad_id=?", (ad_id,)).fetchone()
    return dict(row) if row else None


def get_virtual_bids() -> dict[str, float]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT category, MAX(virtual_bid) as bid FROM ads GROUP BY category"
        ).fetchall()
    return {r["category"]: r["bid"] for r in rows}


def update_virtual_bid(category: str, bid: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE ads SET virtual_bid=? WHERE category=?", (bid, category)
        )


# ── Events ─────────────────────────────────────────────────────────────────

def log_event(
    user_id: str,
    ad_id: str,
    event_type: str,
    dwell_ms: int = 0,
    completion: float = 0.0,
) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO events(user_id, ad_id, event_type, dwell_ms, completion)"
            " VALUES (?, ?, ?, ?, ?)",
            (user_id, ad_id, event_type, dwell_ms, completion),
        )


def get_kpi(minutes: int = 60) -> dict[str, Any]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                strftime('%Y-%m-%dT%H:%M:00', created_at) as minute,
                COUNT(*) as impressions,
                SUM(CASE WHEN event_type='complete' THEN 1 ELSE 0 END) as completes,
                SUM(CASE WHEN event_type='like'     THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN event_type='skip'     THEN 1 ELSE 0 END) as skips,
                AVG(CASE WHEN event_type IN ('complete','like') THEN completion ELSE NULL END) as avg_completion
            FROM events
            WHERE created_at >= datetime('now', ? || ' minutes')
            GROUP BY minute
            ORDER BY minute
            """,
            (f"-{minutes}",),
        ).fetchall()

    timeline = []
    for r in rows:
        impressions = r["impressions"] or 1
        ctr = (r["completes"] + r["likes"]) / impressions
        ecvr = (r["avg_completion"] or 0.0)
        cpa = (1.0 / ctr) if ctr > 0 else 0.0
        timeline.append(
            {
                "minute": r["minute"],
                "impressions": impressions,
                "ctr": round(ctr, 4),
                "ecvr": round(ecvr, 4),
                "cpa": round(cpa, 2),
            }
        )
    return {"timeline": timeline, "minutes": minutes}
