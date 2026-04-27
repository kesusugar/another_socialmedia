from __future__ import annotations

import threading
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import torch
import torch.nn as nn

from db.crud import (
    get_ctr_training_data,
    get_mf_training_data,
    get_session_training_data,
)
from engine.features import CATEGORIES
from ml.features import SEQ_LEN, build_ctr_features, build_session_step
from ml.models import CTRModel, MFModel, SessionGRUModel
from ml.store import MLModelStore, PerModelMeta

TRAIN_EPOCHS  = 50
LEARNING_RATE = 1e-3
MIN_SAMPLES   = 10
RETRAIN_EVERY = 20


class ModelTrainer:
    """Orchestrates background training for CTR LR, MF, and Session GRU."""

    def __init__(self, store: MLModelStore) -> None:
        self._store           = store
        self._lock            = threading.Lock()
        self._event_count     = 0
        self._training_active = False

    def notify_new_event(self) -> None:
        with self._lock:
            self._event_count += 1
            should = (
                self._event_count % RETRAIN_EVERY == 0
                and not self._training_active
            )
        if should:
            threading.Thread(target=self._train_all, daemon=True).start()

    def force_train(self) -> None:
        if not self._training_active:
            threading.Thread(target=self._train_all, daemon=True).start()

    # ── Orchestrator ─────────────────────────────────────────────────────────

    def _train_all(self) -> None:
        with self._lock:
            self._training_active = True
        try:
            self._train_ctr()
            self._train_mf()
            self._train_gru()
            self._store.save_all()
        finally:
            with self._lock:
                self._training_active = False

    # ── CTR Logistic Regression ───────────────────────────────────────────────

    def _train_ctr(self) -> None:
        rows = get_ctr_training_data(limit=2000)
        if len(rows) < MIN_SAMPLES:
            return

        features_list: list[list[float]] = []
        labels: list[float] = []

        for r in rows:
            label = 1.0 if r["event_type"] in ("complete", "like") else 0.0
            user_prefs = {
                cat: {
                    "alpha": r.get(f"alpha_{cat}") or 1.0,
                    "beta":  r.get(f"beta_{cat}")  or 1.0,
                }
                for cat in CATEGORIES
            }
            ad = {
                "category":    r["category"],
                "vector_json": r["vector_json"],
                "cold_start":  r["cold_start"],
            }
            try:
                hour = int(str(r["created_at"])[11:13])
            except (TypeError, ValueError, IndexError):
                hour = 12
            features_list.append(build_ctr_features(user_prefs, ad, hour))
            labels.append(label)

        X = torch.tensor(features_list, dtype=torch.float32)
        y = torch.tensor(labels,        dtype=torch.float32).unsqueeze(1)

        model     = CTRModel()
        optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
        criterion = nn.BCELoss()

        model.train()
        last_loss = 0.0
        for _ in range(TRAIN_EPOCHS):
            optimizer.zero_grad()
            loss = criterion(model(X), y)
            loss.backward()
            optimizer.step()
            last_loss = loss.item()

        model.eval()
        with torch.no_grad():
            acc = float(((model(X) >= 0.5).float() == y).float().mean())

        prev = self._store.get_all_status()["ctr_lr"]["training_count"]
        self._store.set_ctr(
            model,
            PerModelMeta(
                training_count=prev + 1,
                last_trained=datetime.now(timezone.utc).isoformat(),
                last_loss=last_loss,
                last_accuracy=acc,
            ),
        )

    # ── Matrix Factorization ──────────────────────────────────────────────────

    def _train_mf(self) -> None:
        rows = get_mf_training_data(limit=5000)
        if len(rows) < MIN_SAMPLES:
            return

        all_users = sorted({r["user_id"] for r in rows})
        all_ads   = sorted({r["ad_id"]   for r in rows})
        user_to_idx = {u: i for i, u in enumerate(all_users)}
        ad_to_idx   = {a: i for i, a in enumerate(all_ads)}

        u_idx  = torch.tensor([user_to_idx[r["user_id"]] for r in rows], dtype=torch.long)
        a_idx  = torch.tensor([ad_to_idx[r["ad_id"]]     for r in rows], dtype=torch.long)
        labels = torch.tensor([float(r["label"])          for r in rows], dtype=torch.float32)

        model     = MFModel(num_users=len(all_users), num_ads=len(all_ads))
        optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
        criterion = nn.BCELoss()

        model.train()
        last_loss = 0.0
        for _ in range(TRAIN_EPOCHS):
            optimizer.zero_grad()
            loss = criterion(model(u_idx, a_idx), labels)
            loss.backward()
            optimizer.step()
            last_loss = loss.item()

        model.eval()
        with torch.no_grad():
            acc = float(((model(u_idx, a_idx) >= 0.5).float() == labels).float().mean())

        prev = self._store.get_all_status()["mf"]["training_count"]
        self._store.set_mf(
            model, user_to_idx, ad_to_idx,
            PerModelMeta(
                training_count=prev + 1,
                last_trained=datetime.now(timezone.utc).isoformat(),
                last_loss=last_loss,
                last_accuracy=acc,
            ),
        )

    # ── Session GRU ───────────────────────────────────────────────────────────

    def _train_gru(self) -> None:
        samples = get_session_training_data(seq_len=SEQ_LEN, min_seq=3)
        if len(samples) < MIN_SAMPLES:
            return

        max_len = min(max(len(seq) for seq, _ in samples), SEQ_LEN)

        X_list: list[list[list[float]]] = []
        y_list: list[int] = []

        for seq, next_cat in samples:
            cat_idx = CATEGORIES.index(next_cat) if next_cat in CATEGORIES else 0
            steps: list[list[float]] = []
            for ev in seq[-max_len:]:
                ad = {"vector_json": ev.get("vector_json"), "category": ev.get("category", "")}
                steps.append(build_session_step(ad, ev["event_type"], ev.get("dwell_ms", 0)))
            while len(steps) < max_len:
                steps.insert(0, [0.0] * 10)
            X_list.append(steps)
            y_list.append(cat_idx)

        X = torch.tensor(X_list, dtype=torch.float32)
        y = torch.tensor(y_list, dtype=torch.long)

        model     = SessionGRUModel()
        optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
        criterion = nn.NLLLoss()

        model.train()
        last_loss = 0.0
        for _ in range(TRAIN_EPOCHS):
            optimizer.zero_grad()
            loss = criterion(model(X), y)
            loss.backward()
            optimizer.step()
            last_loss = loss.item()

        model.eval()
        with torch.no_grad():
            acc = float((model(X).argmax(dim=1) == y).float().mean())

        prev = self._store.get_all_status()["session_gru"]["training_count"]
        self._store.set_gru(
            model,
            PerModelMeta(
                training_count=prev + 1,
                last_trained=datetime.now(timezone.utc).isoformat(),
                last_loss=last_loss,
                last_accuracy=acc,
            ),
        )
