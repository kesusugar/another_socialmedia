from __future__ import annotations

import sqlite3
import uuid
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
    _migrate_db()


def _migrate_db() -> None:
    """Add new columns to existing DBs without breaking fresh installs."""
    migrations = [
        "ALTER TABLE ads ADD COLUMN daily_budget  REAL DEFAULT 1000.0",
        "ALTER TABLE ads ADD COLUMN spent_today   REAL DEFAULT 0.0",
        "ALTER TABLE ads ADD COLUMN bid_strategy  TEXT DEFAULT 'manual'",
        "ALTER TABLE ads ADD COLUMN target_cpa    REAL DEFAULT 500.0",
        "ALTER TABLE ads ADD COLUMN campaign_id   TEXT REFERENCES campaigns(campaign_id)",
        "ALTER TABLE user_preferences ADD COLUMN confidence_score REAL DEFAULT 0.0",
    ]
    with get_conn() as conn:
        for sql in migrations:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError:
                pass  # column already exists


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


def get_user_ad_frequency(user_id: str, ad_id: str) -> int:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM events WHERE user_id=? AND ad_id=?",
            (user_id, ad_id),
        ).fetchone()
    return row["cnt"] if row else 0


def get_category_impression_count(category: str, since_minutes: int = 1440) -> int:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM events e"
            " JOIN ads a ON e.ad_id = a.ad_id"
            " WHERE a.category=?"
            " AND e.created_at >= datetime('now', ? || ' minutes')",
            (category, f"-{since_minutes}"),
        ).fetchone()
    return row["cnt"] if row else 0


def get_recent_cpa_by_category(category: str, minutes: int = 30) -> float:
    """Estimate CPA as (impressions / conversions) for recent category events."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as total,"
            " SUM(CASE WHEN e.event_type IN ('complete','like') THEN 1 ELSE 0 END) as conv"
            " FROM events e JOIN ads a ON e.ad_id = a.ad_id"
            " WHERE a.category=?"
            " AND e.created_at >= datetime('now', ? || ' minutes')",
            (category, f"-{minutes}"),
        ).fetchone()
    if not row or not row["total"] or not row["conv"]:
        return 0.0
    ctr = row["conv"] / row["total"]
    return (1.0 / ctr) if ctr > 0 else 0.0


def get_ctr_training_data(limit: int = 2000) -> list[dict[str, Any]]:
    """Return recent events with joined ad+user-preference data for CTR training."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                e.user_id, e.ad_id, e.event_type, e.dwell_ms, e.completion,
                e.created_at,
                a.category, a.vector_json, a.cold_start,
                up_tech.alpha    AS alpha_tech,    up_tech.beta    AS beta_tech,
                up_animal.alpha  AS alpha_animal,  up_animal.beta  AS beta_animal,
                up_comedy.alpha  AS alpha_comedy,  up_comedy.beta  AS beta_comedy,
                up_news.alpha    AS alpha_news,    up_news.beta    AS beta_news,
                up_sports.alpha  AS alpha_sports,  up_sports.beta  AS beta_sports
            FROM events e
            JOIN ads a ON e.ad_id = a.ad_id
            LEFT JOIN user_preferences up_tech
                ON e.user_id = up_tech.user_id   AND up_tech.category   = 'tech'
            LEFT JOIN user_preferences up_animal
                ON e.user_id = up_animal.user_id AND up_animal.category = 'animal'
            LEFT JOIN user_preferences up_comedy
                ON e.user_id = up_comedy.user_id AND up_comedy.category = 'comedy'
            LEFT JOIN user_preferences up_news
                ON e.user_id = up_news.user_id   AND up_news.category   = 'news'
            LEFT JOIN user_preferences up_sports
                ON e.user_id = up_sports.user_id AND up_sports.category = 'sports'
            WHERE e.event_type IN ('complete', 'like', 'skip')
            ORDER BY e.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_mf_training_data(limit: int = 5000) -> list[dict[str, Any]]:
    """Return (user_id, ad_id, label) rows for Matrix Factorization training."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                e.user_id,
                e.ad_id,
                CASE WHEN e.event_type IN ('complete','like') THEN 1 ELSE 0 END AS label
            FROM events e
            WHERE e.event_type IN ('complete', 'like', 'skip')
            ORDER BY e.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_session_training_data(
    seq_len: int = 10,
    min_seq: int = 3,
) -> list[tuple[list[dict[str, Any]], str]]:
    """Return (event_sequence, next_category) tuples for GRU training."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT e.user_id, e.ad_id, e.event_type, e.dwell_ms,
                   e.created_at, a.category, a.vector_json
            FROM events e
            JOIN ads a ON e.ad_id = a.ad_id
            ORDER BY e.user_id, e.created_at ASC
            """,
        ).fetchall()

    from collections import defaultdict
    user_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        user_events[r["user_id"]].append(dict(r))

    samples: list[tuple[list[dict[str, Any]], str]] = []
    for events in user_events.values():
        if len(events) < min_seq + 1:
            continue
        for i in range(min_seq, len(events)):
            seq = events[max(0, i - seq_len):i]
            samples.append((seq, events[i]["category"]))
    return samples


# ── Campaigns ──────────────────────────────────────────────────────────────

def create_campaign(
    name: str,
    category: str,
    daily_budget: float,
    bid_strategy: str,
    target_cpa: float,
) -> str:
    campaign_id = "cmp_" + uuid.uuid4().hex[:8]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO campaigns(campaign_id, name, category, daily_budget, bid_strategy, target_cpa)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (campaign_id, name, category, daily_budget, bid_strategy, target_cpa),
        )
    return campaign_id


def get_all_campaigns() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM campaigns ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM campaigns WHERE campaign_id=?", (campaign_id,)
        ).fetchone()
    return dict(row) if row else None


def update_campaign(campaign_id: str, **kwargs: Any) -> None:
    allowed = {"name", "daily_budget", "bid_strategy", "target_cpa", "status", "category"}
    sets = {k: v for k, v in kwargs.items() if k in allowed}
    if not sets:
        return
    cols = ", ".join(f"{k}=?" for k in sets)
    vals = list(sets.values()) + [campaign_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE campaigns SET {cols} WHERE campaign_id=?", vals)


def delete_campaign(campaign_id: str) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE ads SET campaign_id=NULL WHERE campaign_id=?", (campaign_id,))
        conn.execute("DELETE FROM campaigns WHERE campaign_id=?", (campaign_id,))


# ── Campaign Ads ────────────────────────────────────────────────────────────

def create_ad_for_campaign(
    campaign_id: str,
    title: str,
    category: str,
    thumbnail: str,
    vector_json: str,
    virtual_bid: float,
    cold_start: int,
) -> str:
    short = uuid.uuid4().hex[:4]
    ad_id = f"{category[:3]}_cmp_{short}"
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO ads(ad_id, campaign_id, title, category, thumbnail,"
            " vector_json, virtual_bid, cold_start)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (ad_id, campaign_id, title, category, thumbnail,
             vector_json, virtual_bid, cold_start),
        )
    return ad_id


def get_ads_by_campaign(campaign_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM ads WHERE campaign_id=? ORDER BY created_at DESC",
            (campaign_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def update_ad(ad_id: str, **kwargs: Any) -> None:
    allowed = {"title", "thumbnail", "virtual_bid", "cold_start", "vector_json", "category"}
    sets = {k: v for k, v in kwargs.items() if k in allowed}
    if not sets:
        return
    cols = ", ".join(f"{k}=?" for k in sets)
    vals = list(sets.values()) + [ad_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE ads SET {cols} WHERE ad_id=?", vals)


def delete_ad(ad_id: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM ads WHERE ad_id=?", (ad_id,))


def get_campaign_kpi(campaign_id: str, minutes: int = 60) -> dict[str, Any]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                strftime('%Y-%m-%dT%H:%M:00', e.created_at) as minute,
                COUNT(*) as impressions,
                SUM(CASE WHEN e.event_type='complete' THEN 1 ELSE 0 END) as completes,
                SUM(CASE WHEN e.event_type='like'     THEN 1 ELSE 0 END) as likes,
                AVG(CASE WHEN e.event_type IN ('complete','like') THEN e.completion ELSE NULL END)
                    as avg_completion
            FROM events e
            JOIN ads a ON e.ad_id = a.ad_id
            WHERE a.campaign_id=?
              AND e.created_at >= datetime('now', ? || ' minutes')
            GROUP BY minute
            ORDER BY minute
            """,
            (campaign_id, f"-{minutes}"),
        ).fetchall()

        total = conn.execute(
            """
            SELECT COUNT(*) as impressions,
                   SUM(CASE WHEN e.event_type IN ('complete','like') THEN 1 ELSE 0 END) as conv
            FROM events e JOIN ads a ON e.ad_id = a.ad_id
            WHERE a.campaign_id=?
              AND e.created_at >= datetime('now', ? || ' minutes')
            """,
            (campaign_id, f"-{minutes}"),
        ).fetchone()

    timeline = []
    for r in rows:
        imp = r["impressions"] or 1
        ctr = (r["completes"] + r["likes"]) / imp
        ecvr = r["avg_completion"] or 0.0
        cpa = round(1.0 / ctr, 2) if ctr > 0 else 0.0
        timeline.append({
            "minute": r["minute"],
            "impressions": imp,
            "ctr": round(ctr, 4),
            "ecvr": round(ecvr, 4),
            "cpa": cpa,
        })

    imp_total = total["impressions"] or 0
    conv_total = total["conv"] or 0
    overall_ctr = conv_total / imp_total if imp_total else 0.0
    return {
        "timeline": timeline,
        "minutes": minutes,
        "total_impressions": imp_total,
        "total_conversions": conv_total,
        "overall_ctr": round(overall_ctr, 4),
        "overall_cpa": round(1.0 / overall_ctr, 2) if overall_ctr > 0 else 0.0,
    }


def get_ad_kpi(ad_id: str, minutes: int = 60) -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) as impressions,
                   SUM(CASE WHEN event_type IN ('complete','like') THEN 1 ELSE 0 END) as conv,
                   AVG(CASE WHEN event_type IN ('complete','like') THEN completion ELSE NULL END)
                       as avg_completion,
                   AVG(dwell_ms) as avg_dwell_ms
            FROM events
            WHERE ad_id=?
              AND created_at >= datetime('now', ? || ' minutes')
            """,
            (ad_id, f"-{minutes}"),
        ).fetchone()

    imp = row["impressions"] or 0
    conv = row["conv"] or 0
    ctr = conv / imp if imp else 0.0
    return {
        "ad_id": ad_id,
        "minutes": minutes,
        "impressions": imp,
        "conversions": conv,
        "ctr": round(ctr, 4),
        "ecvr": round(row["avg_completion"] or 0.0, 4),
        "cpa": round(1.0 / ctr, 2) if ctr > 0 else 0.0,
        "avg_dwell_ms": round(row["avg_dwell_ms"] or 0.0, 0),
    }


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
                AVG(CASE WHEN event_type IN ('complete','like') THEN completion ELSE NULL END)
                    as avg_completion
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
        ecvr = r["avg_completion"] or 0.0
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
