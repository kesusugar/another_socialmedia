import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { CampaignKpi } from "../types";

interface Props {
  campaignId: string;
}

function shortTime(iso: string) {
  return iso.slice(11, 16);
}

export function CampaignKpiChart({ campaignId }: Props) {
  const [kpi, setKpi] = useState<CampaignKpi | null>(null);
  const [minutes, setMinutes] = useState(60);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/advertiser/campaigns/${campaignId}/kpi?minutes=${minutes}`);
      setKpi(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [campaignId, minutes]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const data = kpi?.timeline.map((p) => ({ ...p, minute: shortTime(p.minute) })) ?? [];

  return (
    <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold">パフォーマンス</h3>
          {kpi && (
            <p className="text-xs text-gray-500">
              IMP: {kpi.total_impressions.toLocaleString()} / CV:{" "}
              {kpi.total_conversions.toLocaleString()} / CTR:{" "}
              {(kpi.overall_ctr * 100).toFixed(2)}% / CPA:{" "}
              {kpi.overall_cpa > 0 ? `¥${kpi.overall_cpa.toLocaleString()}` : "—"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => void load()}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
          >
            更新
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          データなし — スワイプUIまたは仮想エージェントでインプレッションを発生させてください
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="minute" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="ctr" stroke="#60a5fa" dot={false} name="CTR" />
            <Line yAxisId="left" type="monotone" dataKey="ecvr" stroke="#34d399" dot={false} name="eCVR" />
            <Line yAxisId="right" type="monotone" dataKey="cpa" stroke="#f87171" dot={false} name="CPA" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
