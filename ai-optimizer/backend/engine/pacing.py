from __future__ import annotations

import math


class PacingEngine:
    """Simulates ad-platform pacing logic with panic behavior when underpacing."""

    BOOST_EXPONENT = 0.5   # √(1/R) — conservative but visible
    MAX_GAIN = 5.0
    WARMUP_HOURS = 0.25    # no panic in the first 15 min of the session

    def gain(self, spent: float, daily_budget: float, elapsed_hours: float) -> float:
        """Return Pacing Gain G.

        G = 1.0  → on pace (no boost)
        G > 1.0  → underpacing (boost bid/eta)
        G = 5.0  → panic (budget barely touched, algorithm goes wild)
        """
        if daily_budget <= 0 or elapsed_hours < self.WARMUP_HOURS:
            return 1.0
        ideal_spend = daily_budget * (elapsed_hours / 24.0)
        if ideal_spend <= 0:
            return 1.0
        R = spent / ideal_spend  # consumption ratio: <1 = underpacing
        if R >= 1.0:
            return 1.0
        return min((1.0 / max(R, 0.01)) ** self.BOOST_EXPONENT, self.MAX_GAIN)

    def eta_boost(self, gain: float) -> float:
        """Extra exploration forced by pacing panic. Capped at +0.6."""
        if gain <= 1.0:
            return 0.0
        return min((gain - 1.0) * 0.15, 0.6)

    def pacing_ratio(self, spent: float, daily_budget: float, elapsed_hours: float) -> float:
        """Return R (consumption ratio). 1.0 = perfect pace."""
        if daily_budget <= 0 or elapsed_hours <= 0:
            return 1.0
        ideal = daily_budget * (elapsed_hours / 24.0)
        return round(spent / ideal, 4) if ideal > 0 else 1.0


if __name__ == "__main__":
    engine = PacingEngine()
    budget = 1000.0
    print("Pacing Gain at various spend levels (elapsed=6h):")
    for spent in [0, 50, 100, 200, 250, 300]:
        g = engine.gain(spent, budget, 6.0)
        r = engine.pacing_ratio(spent, budget, 6.0)
        print(f"  spent={spent:4d}  R={r:.2f}  G={g:.3f}  eta_boost={engine.eta_boost(g):.3f}")
