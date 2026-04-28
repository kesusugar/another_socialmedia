from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

from .persona import DEFAULT_PERSONAS, Persona, decide_event

MAX_RETRIES = 3
RETRY_WAIT_SEC = 5.0


@dataclass
class AgentState:
    agent_id: str
    persona_name: str
    user_id: str
    swipe_count: int = 0
    event_counts: dict[str, int] = field(
        default_factory=lambda: {"complete": 0, "skip": 0, "lp_click": 0, "impression": 0, "purchase": 0}
    )
    running: bool = False
    started_at: str = ""
    last_event_at: str = ""
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "persona_name": self.persona_name,
            "user_id": self.user_id,
            "swipe_count": self.swipe_count,
            "event_counts": dict(self.event_counts),
            "running": self.running,
            "started_at": self.started_at,
            "last_event_at": self.last_event_at,
            "error": self.error,
        }


class AgentRunner:
    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self._base = base_url.rstrip("/")
        self._agents: dict[str, AgentState] = {}
        self._threads: dict[str, threading.Thread] = {}
        self._lock = threading.Lock()

    def set_base_url(self, url: str) -> None:
        self._base = url.rstrip("/")

    def available_personas(self) -> list[dict]:
        result = []
        for p in DEFAULT_PERSONAS.values():
            result.append({
                "name": p.name,
                "description": p.description,
                "preferred_categories": p.preferred_categories,
                "behavior_style": p.behavior_style,
                "swipe_interval_sec": p.swipe_interval_sec,
                "fatigue_rate": p.fatigue_rate,
            })
        return result

    def start(self, persona_name: str, count: int = 1) -> list[str]:
        if persona_name not in DEFAULT_PERSONAS:
            raise ValueError(f"Unknown persona: {persona_name}")
        persona = DEFAULT_PERSONAS[persona_name]
        started_ids: list[str] = []
        for _ in range(count):
            agent_id = f"bot_{persona_name}_{uuid.uuid4().hex[:6]}"
            user_id = f"bot_{persona_name}_{uuid.uuid4().hex[:6]}"
            state = AgentState(
                agent_id=agent_id,
                persona_name=persona_name,
                user_id=user_id,
                running=True,
                started_at=datetime.now(timezone.utc).isoformat(),
            )
            t = threading.Thread(
                target=self._run_agent,
                args=(state, persona),
                daemon=True,
                name=f"agent-{agent_id}",
            )
            with self._lock:
                self._agents[agent_id] = state
                self._threads[agent_id] = t
            t.start()
            started_ids.append(agent_id)
        return started_ids

    def stop(self, agent_id: str) -> bool:
        with self._lock:
            state = self._agents.get(agent_id)
        if state is None:
            return False
        state.running = False
        return True

    def stop_all(self) -> int:
        with self._lock:
            states = list(self._agents.values())
        for s in states:
            s.running = False
        return len(states)

    def status(self) -> list[dict]:
        with self._lock:
            return [s.to_dict() for s in self._agents.values()]

    def cleanup_stopped(self) -> None:
        with self._lock:
            dead = [aid for aid, s in self._agents.items() if not s.running]
            for aid in dead:
                t = self._threads.pop(aid, None)
                if t and not t.is_alive():
                    self._agents.pop(aid, None)

    def _run_agent(self, state: AgentState, persona: Persona) -> None:
        retries = 0
        while state.running:
            try:
                rec = requests.get(
                    f"{self._base}/recommend",
                    params={"user_id": state.user_id},
                    timeout=5,
                )
                rec.raise_for_status()
                data = rec.json()
                is_organic = data.get("is_organic", False)

                state.swipe_count += 1

                if is_organic:
                    # organic content — no ad event to record
                    state.last_event_at = datetime.now(timezone.utc).isoformat()
                    state.error = ""
                    retries = 0
                    jitter = persona.swipe_interval_sec * (0.7 + 0.6 * (hash(state.agent_id + str(state.swipe_count)) % 100) / 100)
                    deadline = time.monotonic() + jitter
                    while time.monotonic() < deadline and state.running:
                        time.sleep(0.1)
                    continue

                ad_id = data["ad_id"]
                ad_category = data["category"]
                fatigue_factor = data.get("debug", {}).get("fatigue_penalty", 0.0)

                # impression event (ad shown to user)
                requests.post(
                    f"{self._base}/event",
                    json={
                        "user_id": state.user_id,
                        "ad_id": ad_id,
                        "event_type": "impression",
                        "dwell_ms": 0,
                        "completion": 0.0,
                    },
                    timeout=5,
                ).raise_for_status()
                state.event_counts["impression"] = state.event_counts.get("impression", 0) + 1

                event_type, dwell_ms, completion = decide_event(
                    persona, ad_category, state.swipe_count, fatigue_factor
                )

                requests.post(
                    f"{self._base}/event",
                    json={
                        "user_id": state.user_id,
                        "ad_id": ad_id,
                        "event_type": event_type,
                        "dwell_ms": dwell_ms,
                        "completion": completion,
                    },
                    timeout=5,
                ).raise_for_status()

                state.event_counts[event_type] = state.event_counts.get(event_type, 0) + 1
                state.last_event_at = datetime.now(timezone.utc).isoformat()
                state.error = ""
                retries = 0

            except Exception as exc:
                state.error = str(exc)
                retries += 1
                if retries >= MAX_RETRIES:
                    state.running = False
                    break
                time.sleep(RETRY_WAIT_SEC)
                continue

            jitter = persona.swipe_interval_sec * (0.7 + 0.6 * (hash(state.agent_id + str(state.swipe_count)) % 100) / 100)
            deadline = time.monotonic() + jitter
            while time.monotonic() < deadline and state.running:
                time.sleep(0.1)

        state.running = False
