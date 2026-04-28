import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface KpiPoint {
  minute: string;
  ctr: number;
  cvr: number;
  cpa_yen: number;
  impressions: number;
  lp_clicks: number;
  purchases: number;
}

interface KpiResponse {
  timeline: KpiPoint[];
  minutes: number;
  competition_level: number;
}

interface CatOps {
  pacing_gain: number;
  pacing_ratio: number;
  bid_strategy: string;
  spent_today: number;
  daily_budget: number;
}

function shortTime(iso: string): string {
  return iso.slice(11, 16);
}

function PacingBadge({ cat, ops }: { cat: string; ops: CatOps }) {
  const { pacing_gain: g } = ops;
  const color = g >= 3 ? "text-red-400 animate-pulse" : g >= 1.5 ? "text-yellow-400" : "text-green-400";
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs space-y-0.5">
      <p className="text-gray-400 capitalize">{cat}</p>
      <p className={`font-bold ${color}`}>G={g.toFixed(2)}</p>
      <p className="text-gray-500">{ops.bid_strategy}</p>
    </div>
  );
}

export function KpiChart() {
  const [data, setData] = useState<KpiPoint[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [competition, setCompetition] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [catOps, setCatOps] = useState<Record<string, CatOps>>({});

  const fetch_ = useCallback(async () => {
    try {
      const [kpiRes, opsRes] = await Promise.all([
        fetch(`/admin/kpi?minutes=${minutes}`),
        fetch("/admin/category-ops"),
      ]);
      const kpi: KpiResponse = await kpiRes.json();
      const ops: Record<string, CatOps> = await opsRes.json();
      setData(kpi.timeline.map((p) => ({ ...p, minute: shortTime(p.minute) })));
      setCompetition(kpi.competition_level ?? 0);
      setCatOps(ops);
      setLastUpdated(new Date().toLocaleTimeString("ja-JP"));
    } catch (e) {
      console.error("KPI fetch error", e);
    }
  }, [minutes]);

  useEffect(() => {
    void fetch_();
    const id = setInterval(() => void fetch_(), 60_000);
    return () => clearInterval(id);
  }, [fetch_]);

  const maxGain = Math.max(...Object.values(catOps).map((o) => o.pacing_gain ?? 1), 1);

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">KPIダッシュボード</h2>
          {competition > 0 && (
            <p className="text-xs text-pink-400">
              競合レベル {(competition * 100).toFixed(0)}% 適用中 — CPA×{(1 + competition).toFixed(2)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-gray-800 text-sm rounded px-2 py-1"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            <option value={15}>15分</option>
            <option value={60}>60分</option>
            <option value={360}>6時間</option>
            <option value={1440}>24時間</option>
          </select>
          <button
            onClick={() => void fetch_()}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
          >
            更新
          </button>
          {lastUpdated && (
            <span className="text-xs text-gray-500">最終: {lastUpdated}</span>
          )}
        </div>
      </div>

      {/* Pacing status row */}
      {Object.keys(catOps).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(catOps).map(([cat, ops]) => (
            <PacingBadge key={cat} cat={cat} ops={ops} />
          ))}
          {maxGain >= 3 && (
            <div className="flex items-center bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-xs text-red-300">
              ⚠ ペーシングパニック発生中 — CPAが悪化します
            </div>
          )}
        </div>
      )}

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          データがありません。スワイプUIを操作してください。
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="minute" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
            <YAxis yAxisId="right" orientation="right" stroke="#f87171" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `¥${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151" }}
              formatter={(v: number, name: string) => {
                if (name === "CPA(円)") return [`¥${v.toLocaleString()}`, name];
                return [`${(v * 100).toFixed(2)}%`, name];
              }}
            />
            <Legend />
            <Line yAxisId="left"  type="monotone" dataKey="ctr"     stroke="#60a5fa" dot={false} name="CTR（LP遷移率）" />
            <Line yAxisId="left"  type="monotone" dataKey="cvr"     stroke="#34d399" dot={false} name="CVR（購入率）" />
            <Line yAxisId="right" type="monotone" dataKey="cpa_yen" stroke="#f87171" dot={false} name="CPA(円)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
