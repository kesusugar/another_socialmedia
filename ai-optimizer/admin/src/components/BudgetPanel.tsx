import { useEffect, useState, useCallback } from "react";

const CATEGORIES = ["tech", "animal", "comedy", "news", "sports"] as const;
const STRATEGY_LABELS: Record<string, string> = {
  manual:       "手動入札",
  tcpa:         "目標CPA（tCPA）",
  max_delivery: "最大配信",
};

interface CatOps {
  daily_budget: number;
  spent_today: number;
  bid_strategy: string;
  target_cpa: number;
  pacing_gain: number;
  pacing_ratio: number;
}

type OpsMap = Record<string, CatOps>;

function PacingBar({ ratio, gain }: { ratio: number; gain: number }) {
  const pct = Math.min(ratio * 100, 100);
  const color =
    gain >= 3 ? "bg-red-500"
    : gain >= 1.5 ? "bg-yellow-400"
    : "bg-green-500";
  return (
    <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BudgetPanel() {
  const [ops, setOps] = useState<OpsMap>({});
  const [pendingBudgets, setPendingBudgets] = useState<Record<string, number>>({});
  const [pendingStrategy, setPendingStrategy] = useState<Record<string, string>>({});
  const [pendingTCPA, setPendingTCPA] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");

  const fetchOps = useCallback(async () => {
    try {
      const res = await fetch("/admin/category-ops");
      const data: OpsMap = await res.json();
      setOps(data);
      setPendingBudgets((prev) =>
        Object.fromEntries(
          CATEGORIES.map((c) => [c, prev[c] ?? data[c]?.daily_budget ?? 1000])
        )
      );
      setPendingStrategy((prev) =>
        Object.fromEntries(
          CATEGORIES.map((c) => [c, prev[c] ?? data[c]?.bid_strategy ?? "manual"])
        )
      );
      setPendingTCPA((prev) =>
        Object.fromEntries(
          CATEGORIES.map((c) => [c, prev[c] ?? data[c]?.target_cpa ?? 500])
        )
      );
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchOps();
    const id = setInterval(() => void fetchOps(), 5000);
    return () => clearInterval(id);
  }, [fetchOps]);

  async function applyCategory(cat: string) {
    await fetch("/admin/category-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: cat,
        daily_budget: pendingBudgets[cat],
        bid_strategy: pendingStrategy[cat],
        target_cpa: pendingTCPA[cat],
      }),
    });
    setStatus(`${cat} を更新しました`);
    setTimeout(() => setStatus(""), 2500);
    void fetchOps();
  }

  async function doubleBudget(cat: string) {
    const newBudget = (pendingBudgets[cat] ?? 1000) * 2;
    setPendingBudgets((p) => ({ ...p, [cat]: newBudget }));
    await fetch("/admin/category-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat, daily_budget: newBudget }),
    });
    setStatus(`${cat} の予算を ${newBudget} に倍増しました`);
    setTimeout(() => setStatus(""), 3000);
    void fetchOps();
  }

  async function resetSpend(cat?: string) {
    await fetch("/admin/category-ops/reset-spend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat ?? null }),
    });
    setStatus(cat ? `${cat} の消化額をリセットしました` : "全カテゴリの消化額をリセットしました");
    setTimeout(() => setStatus(""), 2500);
    void fetchOps();
  }

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">予算・入札戦略コントロール</h2>
        <button
          onClick={() => void resetSpend()}
          className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
        >
          全リセット
        </button>
      </div>

      {status && <p className="text-green-400 text-sm">{status}</p>}

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const o = ops[cat];
          const gain = o?.pacing_gain ?? 1;
          const ratio = o?.pacing_ratio ?? 1;
          const strategy = pendingStrategy[cat] ?? "manual";
          return (
            <div key={cat} className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize">{cat}</span>
                <div className="flex items-center gap-2 text-xs">
                  {gain >= 3 && (
                    <span className="text-red-400 font-bold animate-pulse">⚠ PANIC</span>
                  )}
                  {gain >= 1.5 && gain < 3 && (
                    <span className="text-yellow-400 font-bold">↑ Pacing</span>
                  )}
                  <span className="text-gray-400">
                    G={gain.toFixed(2)} R={ratio.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Pacing progress bar */}
              {o && (
                <div className="text-xs text-gray-400">
                  消化: ¥{o.spent_today.toFixed(0)} / ¥{o.daily_budget.toFixed(0)}
                  <PacingBar ratio={ratio} gain={gain} />
                </div>
              )}

              {/* Daily budget */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20 shrink-0">日予算 (¥)</label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={pendingBudgets[cat] ?? 1000}
                  onChange={(e) =>
                    setPendingBudgets((p) => ({ ...p, [cat]: Number(e.target.value) }))
                  }
                  className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm"
                />
                <button
                  onClick={() => void doubleBudget(cat)}
                  className="text-xs bg-orange-700 hover:bg-orange-600 px-2 py-1 rounded whitespace-nowrap"
                >
                  ×2
                </button>
              </div>

              {/* Strategy */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 w-20 shrink-0">戦略</label>
                <select
                  value={strategy}
                  onChange={(e) =>
                    setPendingStrategy((p) => ({ ...p, [cat]: e.target.value }))
                  }
                  className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm"
                >
                  {Object.entries(STRATEGY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              {/* tCPA target */}
              {strategy === "tcpa" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-20 shrink-0">目標CPA (¥)</label>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={pendingTCPA[cat] ?? 500}
                    onChange={(e) =>
                      setPendingTCPA((p) => ({ ...p, [cat]: Number(e.target.value) }))
                    }
                    className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => void applyCategory(cat)}
                  className="flex-1 bg-blue-700 hover:bg-blue-600 text-white text-xs py-1.5 rounded"
                >
                  適用
                </button>
                <button
                  onClick={() => void resetSpend(cat)}
                  className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-1.5 rounded"
                >
                  消化リセット
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
