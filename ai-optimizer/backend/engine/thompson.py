from __future__ import annotations

import numpy as np
from scipy.stats import beta as beta_dist


class ThompsonSampler:
    """Multi-armed bandit via Thompson Sampling over Beta distributions."""

    def __init__(self, eta: float = 0.2) -> None:
        # eta=0: pure exploit, eta=1: pure explore
        self.eta = eta

    def sample(
        self,
        prefs: dict[str, dict[str, float]],
        virtual_bids: dict[str, float] | None = None,
    ) -> tuple[str, float]:
        """Return (best_category, score).

        prefs: {category: {"alpha": float, "beta": float}}
        virtual_bids: {category: float}  bid multiplier
        """
        if not prefs:
            raise ValueError("prefs must not be empty")

        bids = virtual_bids or {}
        scores: dict[str, float] = {}

        for category, params in prefs.items():
            alpha = max(params.get("alpha", 1.0), 1e-6)
            b = max(params.get("beta", 1.0), 1e-6)

            if self.eta >= 1.0:
                # full exploration: uniform sample
                sampled = float(np.random.random())
            elif self.eta <= 0.0:
                # full exploitation: use mean
                sampled = alpha / (alpha + b)
            else:
                # epsilon-greedy hybrid: blend sampling and mean
                sampled = float(beta_dist.rvs(alpha, b))
                mean = alpha / (alpha + b)
                sampled = (1 - self.eta) * sampled + self.eta * mean

            bid = bids.get(category, 1.0)
            scores[category] = sampled * bid

        best = max(scores, key=lambda c: scores[c])
        return best, scores[best]

    def rank(
        self,
        prefs: dict[str, dict[str, float]],
        virtual_bids: dict[str, float] | None = None,
    ) -> list[tuple[str, float]]:
        """Return all categories sorted by sampled score descending."""
        bids = virtual_bids or {}
        scored = []
        for category, params in prefs.items():
            alpha = max(params.get("alpha", 1.0), 1e-6)
            b = max(params.get("beta", 1.0), 1e-6)
            sampled = float(beta_dist.rvs(alpha, b))
            bid = bids.get(category, 1.0)
            scored.append((category, sampled * bid))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored


if __name__ == "__main__":
    prefs = {
        "tech":    {"alpha": 5.0, "beta": 2.0},
        "animal":  {"alpha": 1.0, "beta": 8.0},
        "comedy":  {"alpha": 3.0, "beta": 3.0},
        "news":    {"alpha": 2.0, "beta": 6.0},
        "sports":  {"alpha": 4.0, "beta": 1.0},
    }
    sampler = ThompsonSampler(eta=0.2)
    best, score = sampler.sample(prefs)
    print(f"Best category: {best!r}  score={score:.4f}")

    ranked = sampler.rank(prefs)
    print("Full ranking:")
    for cat, s in ranked:
        a = prefs[cat]["alpha"]
        b = prefs[cat]["beta"]
        print(f"  {cat:<10} alpha={a} beta={b}  score={s:.4f}")
