from __future__ import annotations


class PIDController:
    """PID feedback controller for tCPA (target Cost Per Action) bidding.

    error = actual_CPA - target_CPA
    positive error → CPA too high → reduce bid
    negative error → CPA below target → can raise bid safely
    """

    def __init__(
        self,
        kp: float = 0.04,
        ki: float = 0.004,
        kd: float = 0.015,
        integral_cap: float = 100.0,
    ) -> None:
        self.kp = kp
        self.ki = ki
        self.kd = kd
        self._integral_cap = integral_cap
        self._integral: float = 0.0
        self._prev_error: float = 0.0

    def update(self, actual_cpa: float, target_cpa: float) -> float:
        """Return bid delta. Positive = lower bid; negative = raise bid."""
        if actual_cpa <= 0:
            return 0.0
        error = actual_cpa - target_cpa
        self._integral = max(
            -self._integral_cap,
            min(self._integral_cap, self._integral + error),
        )
        derivative = error - self._prev_error
        self._prev_error = error
        return self.kp * error + self.ki * self._integral + self.kd * derivative

    def reset(self) -> None:
        self._integral = 0.0
        self._prev_error = 0.0

    def state(self) -> dict[str, float]:
        return {
            "integral": round(self._integral, 4),
            "prev_error": round(self._prev_error, 4),
        }


if __name__ == "__main__":
    pid = PIDController()
    target = 500.0
    # Simulate CPA starting high and converging
    actual_cpa = 800.0
    base_bid = 2.0
    print(f"tCPA simulation — target={target}")
    for step in range(20):
        delta = pid.update(actual_cpa, target)
        base_bid = max(0.5, min(5.0, base_bid - delta * 0.01))
        actual_cpa = max(50.0, actual_cpa - (delta * 3))  # simplified plant
        print(f"  step={step:2d}  actual_cpa={actual_cpa:6.1f}  bid={base_bid:.3f}  delta={delta:+.3f}")
