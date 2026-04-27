from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import torch

from ml.models import CTRModel, MFModel, SessionGRUModel

MODEL_DIR = Path(__file__).parent.parent / "ml_weights"
CTR_PATH  = MODEL_DIR / "ctr_model.pt"
MF_PATH   = MODEL_DIR / "mf_model.pt"
GRU_PATH  = MODEL_DIR / "gru_model.pt"
META_PATH = MODEL_DIR / "ml_meta.json"


@dataclass
class PerModelMeta:
    training_count: int = 0
    last_trained: str = ""
    last_loss: float = 0.0
    last_accuracy: float = 0.0


class MLModelStore:
    """Thread-safe container for trained models and their metadata."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ctr: CTRModel | None = None
        self._mf:  MFModel  | None = None
        self._gru: SessionGRUModel | None = None
        self._mf_user_to_idx: dict[str, int] = {}
        self._mf_ad_to_idx:   dict[str, int] = {}
        self._mf_num_users: int = 0
        self._mf_num_ads:   int = 0
        self._ctr_meta = PerModelMeta()
        self._mf_meta  = PerModelMeta()
        self._gru_meta = PerModelMeta()

    # ── Getters ──────────────────────────────────────────────────────────────

    def get_ctr(self) -> CTRModel | None:
        with self._lock:
            return self._ctr

    def get_mf(self) -> tuple[MFModel, dict[str, int], dict[str, int]] | None:
        with self._lock:
            if self._mf is None:
                return None
            return self._mf, self._mf_user_to_idx, self._mf_ad_to_idx

    def get_gru(self) -> SessionGRUModel | None:
        with self._lock:
            return self._gru

    # ── Setters ──────────────────────────────────────────────────────────────

    def set_ctr(self, model: CTRModel, meta: PerModelMeta) -> None:
        with self._lock:
            self._ctr = model
            self._ctr_meta = meta

    def set_mf(
        self,
        model: MFModel,
        user_to_idx: dict[str, int],
        ad_to_idx: dict[str, int],
        meta: PerModelMeta,
    ) -> None:
        with self._lock:
            self._mf = model
            self._mf_user_to_idx = user_to_idx
            self._mf_ad_to_idx   = ad_to_idx
            self._mf_num_users   = len(user_to_idx)
            self._mf_num_ads     = len(ad_to_idx)
            self._mf_meta = meta

    def set_gru(self, model: SessionGRUModel, meta: PerModelMeta) -> None:
        with self._lock:
            self._gru = model
            self._gru_meta = meta

    # ── Status ───────────────────────────────────────────────────────────────

    def get_all_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "ctr_lr": {
                    "ready":          self._ctr is not None,
                    "training_count": self._ctr_meta.training_count,
                    "last_trained":   self._ctr_meta.last_trained,
                    "last_loss":      round(self._ctr_meta.last_loss, 6),
                    "last_accuracy":  round(self._ctr_meta.last_accuracy, 4),
                },
                "mf": {
                    "ready":          self._mf is not None,
                    "training_count": self._mf_meta.training_count,
                    "last_trained":   self._mf_meta.last_trained,
                    "last_loss":      round(self._mf_meta.last_loss, 6),
                    "last_accuracy":  round(self._mf_meta.last_accuracy, 4),
                    "num_users":      self._mf_num_users,
                    "num_ads":        self._mf_num_ads,
                },
                "session_gru": {
                    "ready":          self._gru is not None,
                    "training_count": self._gru_meta.training_count,
                    "last_trained":   self._gru_meta.last_trained,
                    "last_loss":      round(self._gru_meta.last_loss, 6),
                    "last_accuracy":  round(self._gru_meta.last_accuracy, 4),
                },
            }

    # ── Disk persistence ─────────────────────────────────────────────────────

    def save_all(self) -> None:
        MODEL_DIR.mkdir(exist_ok=True)
        with self._lock:
            if self._ctr is not None:
                torch.save(self._ctr.state_dict(), CTR_PATH)
            if self._mf is not None:
                torch.save(
                    {
                        "state_dict":  self._mf.state_dict(),
                        "num_users":   self._mf_num_users,
                        "num_ads":     self._mf_num_ads,
                        "user_to_idx": self._mf_user_to_idx,
                        "ad_to_idx":   self._mf_ad_to_idx,
                    },
                    MF_PATH,
                )
            if self._gru is not None:
                torch.save(self._gru.state_dict(), GRU_PATH)
            meta = {
                "ctr": vars(self._ctr_meta),
                "mf":  vars(self._mf_meta),
                "gru": vars(self._gru_meta),
            }
            META_PATH.write_text(json.dumps(meta, indent=2))

    def load_all(self) -> None:
        MODEL_DIR.mkdir(exist_ok=True)
        if META_PATH.exists():
            try:
                raw = json.loads(META_PATH.read_text())
                self._ctr_meta = PerModelMeta(**raw.get("ctr", {}))
                self._mf_meta  = PerModelMeta(**raw.get("mf",  {}))
                self._gru_meta = PerModelMeta(**raw.get("gru", {}))
            except Exception:
                pass

        if CTR_PATH.exists():
            try:
                m = CTRModel()
                m.load_state_dict(torch.load(CTR_PATH, weights_only=True))
                m.eval()
                self._ctr = m
            except Exception:
                pass

        if MF_PATH.exists():
            try:
                ckpt = torch.load(MF_PATH, weights_only=False)
                m = MFModel(num_users=ckpt["num_users"], num_ads=ckpt["num_ads"])
                m.load_state_dict(ckpt["state_dict"])
                m.eval()
                self._mf             = m
                self._mf_user_to_idx = ckpt["user_to_idx"]
                self._mf_ad_to_idx   = ckpt["ad_to_idx"]
                self._mf_num_users   = ckpt["num_users"]
                self._mf_num_ads     = ckpt["num_ads"]
            except Exception:
                pass

        if GRU_PATH.exists():
            try:
                m = SessionGRUModel()
                m.load_state_dict(torch.load(GRU_PATH, weights_only=True))
                m.eval()
                self._gru = m
            except Exception:
                pass
