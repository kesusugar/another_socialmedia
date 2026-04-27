import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface KpiPoint {
  minute: string;
  ctr: number;
  ecvr: number;
  cpa: number;
  impressions: number;
}

interface KpiResponse {
  timeline: KpiPoint[];
  minutes: number;
}

function shortTime(iso: string): string {
  return iso.slice(11, 16);
}

export function KpiChart() {
  const [data, setData] = useState<KpiPoint[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/admin/kpi?minutes=${minutes}`);
      const json: KpiResponse = await res.json();
      setData(json.timeline.map((p) => ({ ...p, minute: shortTime(p.minute) })));
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

  return (
    <section className="bg-gray-900 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">KPIダッシュボード</h2>
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

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          データがありません。スワイプUIを操作してイベントを発生させてください。
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="minute" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151" }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ctr"
              stroke="#60a5fa"
              dot={false}
              name="CTR"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ecvr"
              stroke="#34d399"
              dot={false}
              name="eCVR"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cpa"
              stroke="#f87171"
              dot={false}
              name="仮想CPA"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
