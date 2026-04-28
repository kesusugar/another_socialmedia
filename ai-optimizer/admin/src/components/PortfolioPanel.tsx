import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const CATEGORIES = ["tech", "animal", "comedy", "news", "sports"] as const;

interface PortfolioPoint {
  md_ratio:      number;
  cc_ratio:      number;
  estimated_cpa: number;
  estimated_imp: number;
  estimated_cv:  number;
}

interface SimResult {
  results:           PortfolioPoint[];
  recommended:       PortfolioPoint | null;
  base_cpa:          number;
  avg_ctr:           number;
  avg_cvr:           number;
  seasonality_active: boolean;
  current_multipliers: { cpm: number; ctr: number; cvr: number };
  note:              string;
}

export function PortfolioPanel() {
  const [category,  setCategory]  = useState("tech");
  const [targetCpa, setTargetCpa] = useState(500);
  const [budget,    setBudget]    = useState(10000);
  const [mdRatio,   setMdRatio]   = useState(0.3);
  const [result,    setResult]    = useState<SimResult | null>(null);
  const [loading,   setLoading]   = useState(false);

  const simulate = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category,
        target_cpa: String(targetCpa),
        budget:     String(budget),
        minutes:    "60",
      });
      const res = await fetch(`/admin/portfolio/simulate?${params}`);
      setResult(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [category, targetCpa, budget]);

  useEffect(() => {
    const t = setTimeout(() => void simulate(), 400);
    return () => clearTimeout(t);
  }, [simulate]);

  const chartData = result?.results.map((p) => ({
    label:  `MD${(p.md_ratio * 100).toFixed(0)}%`,
    cpa:    p.estimated_cpa,
    imp:    p.estimated_imp,
    cv:     p.estimated_cv,
    ratio:  p.md_ratio,
  })) ?? [];

  const currentPoint = result?.results.find(
    (p) => Math.abs(p.md_ratio - mdRatio) < 0.05
  ) ?? result?.results[Math.round(mdRatio * 10)];

  const bestRatio = result?.recommended?.md_ratio ?? 0;

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold">MD / CC ポートフォリオシミュレーター</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          最大配信（MD）とコストキャップ（CC）の比率がCPA・獲得量に与える影響を試算します
        </p>
      </div>

      {/* 入力パラメーター */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">カテゴリ</label>
          <select
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">目標CPA (¥)</label>
          <input
            type="number" min={10} step={100}
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
            value={targetCpa}
            onChange={(e) => setTargetCpa(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">日予算 (¥)</label>
          <input
            type="number" min={1000} step={1000}
            className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </div>
      </div>

      {/* MD比率スライダー */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold">
            MD比率:{" "}
            <span className="text-orange-400">{(mdRatio * 100).toFixed(0)}%</span>
            {" / "}
            CC比率:{" "}
            <span className="text-blue-400">{((1 - mdRatio) * 100).toFixed(0)}%</span>
          </label>
          {loading && <span className="text-xs text-gray-500 animate-pulse">計算中...</span>}
        </div>
        <input
          type="range" min={0} max={1} step={0.1}
          value={mdRatio}
          onChange={(e) => setMdRatio(Number(e.target.value))}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>0% (CC100%)</span>
          <span>50/50</span>
          <span>100% (MD100%)</span>
        </div>
      </div>

      {/* 選択比率の推定値 */}
      {currentPoint && (
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "推定CPA", value: `¥${currentPoint.estimated_cpa.toLocaleString()}`, color: currentPoint.estimated_cpa <= targetCpa ? "text-green-400" : "text-red-400" },
            { label: "推定IMP", value: currentPoint.estimated_imp.toLocaleString(), color: "text-blue-400" },
            { label: "推定CV数", value: currentPoint.estimated_cv.toFixed(1), color: "text-purple-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-800 rounded-xl p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* トレードオフチャート */}
      {chartData.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">MD比率 vs CPA・IMP トレードオフ</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#6b7280" />
              <YAxis yAxisId="cpa" orientation="left"  stroke="#f87171" tick={{ fontSize: 10 }} label={{ value: "CPA(¥)", angle: -90, position: "insideLeft", fill: "#f87171", fontSize: 10 }} />
              <YAxis yAxisId="imp" orientation="right" stroke="#60a5fa" tick={{ fontSize: 10 }} label={{ value: "IMP", angle: 90, position: "insideRight", fill: "#60a5fa", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 12 }}
                formatter={(v: number, name: string) =>
                  name === "CPA" ? [`¥${v.toLocaleString()}`, name] : [v.toLocaleString(), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="cpa" y={targetCpa} stroke="#facc15" strokeDasharray="4 2" label={{ value: `目標¥${targetCpa}`, fill: "#facc15", fontSize: 10 }} />
              {result?.recommended && (
                <ReferenceLine
                  yAxisId="cpa"
                  x={`MD${(bestRatio * 100).toFixed(0)}%`}
                  stroke="#a78bfa"
                  strokeWidth={2}
                  label={{ value: "推奨", fill: "#a78bfa", fontSize: 10 }}
                />
              )}
              <Line yAxisId="cpa" type="monotone" dataKey="cpa" stroke="#f87171" strokeWidth={2} dot={false} name="CPA" />
              <Bar  yAxisId="imp" dataKey="imp" fill="#60a5fa" fillOpacity={0.4} name="IMP" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 推奨表示 */}
      {result?.recommended && (
        <div className="bg-purple-900/30 border border-purple-700 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-purple-300">
            推奨配分: MD {(bestRatio * 100).toFixed(0)}% / CC {((1 - bestRatio) * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-400">
            推定CPA ¥{result.recommended.estimated_cpa.toLocaleString()} ／
            推定IMP {result.recommended.estimated_imp.toLocaleString()} ／
            推定CV {result.recommended.estimated_cv.toFixed(1)}件
          </p>
          {result.seasonality_active && (
            <p className="text-xs text-yellow-400">
              季節性適用中 — CPM×{result.current_multipliers.cpm.toFixed(2)} / CTR×{result.current_multipliers.ctr.toFixed(2)} / CVR×{result.current_multipliers.cvr.toFixed(2)}
            </p>
          )}
        </div>
      )}

      {/* 解説 */}
      <details className="bg-gray-800 rounded-xl">
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-blue-300 hover:text-blue-200">
          チャートの読み方
        </summary>
        <div className="px-4 pb-4 text-xs text-gray-400 space-y-1">
          <p>・MD比率を上げるとIMPは増えるがCPAが上昇します</p>
          <p>・CC比率を上げるとCPAは改善しますがIMPが減少します</p>
          <p>・「推奨」縦線はCPAが最小になる最適比率を示します</p>
          <p>・黄色点線は設定した目標CPAです — 推定CPAが下回る範囲を探してください</p>
          <p>・季節性が有効な場合、現在の時間帯・曜日の乗数が計算に反映されます</p>
        </div>
      </details>

      {result && (
        <p className="text-xs text-gray-600">
          ベースCPA: ¥{result.base_cpa.toLocaleString()} ／ {result.note}
        </p>
      )}
    </section>
  );
}
