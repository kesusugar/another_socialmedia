from __future__ import annotations

import copy
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SeasonalityConfig:
    cpm_by_hour: list[float] = field(default_factory=lambda: [1.0] * 24)
    ctr_by_hour: list[float] = field(default_factory=lambda: [1.0] * 24)
    cvr_by_hour: list[float] = field(default_factory=lambda: [1.0] * 24)
    cpm_by_dow:  list[float] = field(default_factory=lambda: [1.0] * 7)
    ctr_by_dow:  list[float] = field(default_factory=lambda: [1.0] * 7)
    cvr_by_dow:  list[float] = field(default_factory=lambda: [1.0] * 7)
    enabled: bool = True

    def to_dict(self) -> dict:
        return {
            "cpm_by_hour": self.cpm_by_hour,
            "ctr_by_hour": self.ctr_by_hour,
            "cvr_by_hour": self.cvr_by_hour,
            "cpm_by_dow":  self.cpm_by_dow,
            "ctr_by_dow":  self.ctr_by_dow,
            "cvr_by_dow":  self.cvr_by_dow,
            "enabled":     self.enabled,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SeasonalityConfig":
        return cls(
            cpm_by_hour=d.get("cpm_by_hour", [1.0] * 24),
            ctr_by_hour=d.get("ctr_by_hour", [1.0] * 24),
            cvr_by_hour=d.get("cvr_by_hour", [1.0] * 24),
            cpm_by_dow= d.get("cpm_by_dow",  [1.0] * 7),
            ctr_by_dow= d.get("ctr_by_dow",  [1.0] * 7),
            cvr_by_dow= d.get("cvr_by_dow",  [1.0] * 7),
            enabled=    d.get("enabled",      True),
        )


# TikTok実態ベースのデフォルトプリセット
DEFAULT_SEASONALITY = SeasonalityConfig(
    # CPM: 夜間(20-23時)が高い、深夜は安い
    cpm_by_hour=[
        0.7, 0.6, 0.5, 0.5, 0.6, 0.7,
        0.8, 0.9, 1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.1, 1.1, 1.1,
        1.2, 1.3, 1.4, 1.4, 1.3, 1.1,
    ],
    # CTR: 昼休み(12-13時)と夜(21-23時)が高い
    ctr_by_hour=[
        0.8, 0.7, 0.7, 0.7, 0.7, 0.8,
        0.9, 1.0, 1.0, 1.0, 1.0, 1.1,
        1.2, 1.1, 1.0, 1.0, 1.0, 1.1,
        1.1, 1.2, 1.3, 1.3, 1.2, 1.0,
    ],
    # CVR: 深夜〜早朝が高い（衝動買い）
    cvr_by_hour=[
        1.2, 1.3, 1.3, 1.2, 1.0, 0.9,
        0.8, 0.9, 0.9, 0.9, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
        1.0, 1.1, 1.1, 1.1, 1.2, 1.2,
    ],
    # 曜日(月〜日): 週末はCPM・CVR高
    cpm_by_dow=[1.0, 1.0, 1.0, 1.0, 1.1, 1.3, 1.3],
    ctr_by_dow=[1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.2],
    cvr_by_dow=[1.0, 1.0, 1.0, 1.0, 1.1, 1.3, 1.3],
)


class SeasonalityEngine:
    def get_multipliers(self, config: SeasonalityConfig, dt: datetime) -> dict[str, float]:
        if not config.enabled:
            return {"cpm": 1.0, "ctr": 1.0, "cvr": 1.0}
        h = dt.hour
        d = dt.weekday()
        return {
            "cpm": round(config.cpm_by_hour[h] * config.cpm_by_dow[d], 4),
            "ctr": round(config.ctr_by_hour[h] * config.ctr_by_dow[d], 4),
            "cvr": round(config.cvr_by_hour[h] * config.cvr_by_dow[d], 4),
        }

    def default_config(self) -> SeasonalityConfig:
        return copy.deepcopy(DEFAULT_SEASONALITY)
