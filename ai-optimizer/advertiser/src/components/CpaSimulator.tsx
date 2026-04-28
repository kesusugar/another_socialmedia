import { useState, useEffect, useCallback } from "react";
import type { CpaSimResult } from "../types";
import { CATEGORIES } from "../types";

interface Props {
  category: string;
  bid: number;
  targetCpa: number;
  bidStrategy: string;
}

export function CpaSimulator({ category, bid, targetCpa, bidStrategy }: Props) {
  const [result, setResult] = useState<CpaSimResult | null>(null);
  const [loading, setLoading] = useState(false);

  const simulate = useCallback(async () => {
    if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) return;
    setLoading(true);
    try {
      const res = await fetch("/advertiser/simulate/cpa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          bid,
          target_cpa: targetCpa,
          bid_strategy: bidStrategy,
        }),
      });
      setResult(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [category, bid, targetCpa, bidStrategy]);

  useEffect(() => {
    const t = setTimeout(() => void simulate(), 300);
    return () => clearTimeout(t);
  }, [simulate]);

  if (!result && !loading) return null;

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-300">CPA シミュレーター</h3>
        {loading && <span className="text-xs text-gray-500 animate-pulse">計算中...</span>}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-500">推定CPA</p>
              <p
                className={`text-xl font-bold ${
                  result.feasible ? "text-green-400" : "text-red-400"
                }`}
              >
                ¥{result.estimated_cpa.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">目標CPA</p>
              <p className="text-xl font-bold text-white">
                ¥{result.target_cpa.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">差分</p>
              <p
                className={`text-xl font-bold ${
                  result.feasible ? "text-green-400" : "text-red-400"
                }`}
              >
                {result.gap >= 0 ? "+" : ""}
                {result.gap.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {result.feasible ? (
              <span className="bg-green-900/50 border border-green-700 text-green-300 px-3 py-1 rounded-full">
                ✓ 目標CPA達成可能
              </span>
            ) : (
              <span className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-1 rounded-full">
                ✗ 目標超過 — 入札額を下げるか目標を引き上げてください
              </span>
            )}
            {result.competition_level > 0 && (
              <span className="text-pink-400">
                競合 {(result.competition_level * 100).toFixed(0)}% 適用中
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
            <p>推定CTR: {(result.estimated_ctr * 100).toFixed(2)}%</p>
            <p>推定eCVR: {(result.estimated_ecvr * 100).toFixed(2)}%</p>
          </div>

          <p className="text-xs text-gray-600">{result.note}</p>
        </>
      )}
    </div>
  );
}
