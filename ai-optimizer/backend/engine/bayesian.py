from __future__ import annotations

POSITIVE_EVENTS = {"complete", "like"}
NEGATIVE_EVENTS = {"skip"}


class BayesianUpdater:
    """Bayesian update of Beta distribution parameters based on user events."""

    def update(
        self,
        params: dict[str, float],
        event_type: str,
    ) -> dict[str, float]:
        """Return updated {alpha, beta} given an event.

        complete/like → alpha += 1
        skip          → beta  += 1
        impression    → no change
        """
        alpha = params.get("alpha", 1.0)
        beta = params.get("beta", 1.0)

        if event_type in POSITIVE_EVENTS:
            alpha += 1.0
        elif event_type in NEGATIVE_EVENTS:
            beta += 1.0

        return {"alpha": alpha, "beta": beta}

    def batch_update(
        self,
        params: dict[str, float],
        events: list[str],
    ) -> dict[str, float]:
        """Apply multiple event updates sequentially."""
        current = dict(params)
        for event_type in events:
            current = self.update(current, event_type)
        return current


if __name__ == "__main__":
    updater = BayesianUpdater()
    state = {"alpha": 1.0, "beta": 1.0}
    print(f"Initial: alpha={state['alpha']} beta={state['beta']}")

    for event in ["impression", "complete", "like", "skip", "complete", "skip", "skip"]:
        state = updater.update(state, event)
        print(f"  after {event:<12} → alpha={state['alpha']} beta={state['beta']}")
