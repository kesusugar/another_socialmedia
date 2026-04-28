import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

interface CampaignEntry {
  campaign_id: string;
  name: string;
  wins: number;
  share: number;
}

interface ShareResponse {
  by_category: Record<string, CampaignEntry[]>;
  total_wins: Record<string, number>;
}

const COLORS = ["#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa", "#fb923c"];

export function CannibalizationPanel() {
  const [data, setData] = useState<ShareResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/admin/campaigns/impression-share");
      setData(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  const categories = data ? Object.keys(data.by_category) : [];
  const hasMultiple = categories.some(
    (cat) => (data?.by_category[cat]?.length ?? 0) >= 2
  );

  if (!data || categories.length === 0) {
    return (
      <section className="bg-gray-900 rounded-2xl p-6">
        <h2 className="text-lg font-bold">インプレッションシェア（カニバリゼーション）</h2>
        <p className="text-gray-500 text-sm mt-3">
          同カテゴリに複数のアクティブキャンペーンを作成すると、インプレッションの取り合いが可視化されます。
        </p>
      </section>
    );
  }

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold">インプレッションシェア（カニバリゼーション）</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          同カテゴリの複数キャンペーンがインプレッションをどう分け合っているか
        </p>
      </div>

      {hasMultiple && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-4 py-2 text-xs text-yellow-300">
          ⚠ 同カテゴリに複数キャンペーンが存在します。予算・インプレッションが分散しCPAが悪化する可能性があります。
        </div>
      )}

      {categories.map((cat) => {
        const entries = data.by_category[cat];
        if (!entries || entries.length === 0) return null;

        const chartData = [{
          category: cat,
          ...Object.fromEntries(entries.map((e) => [e.name, e.wins])),
        }];

        return (
          <div key={cat} className="space-y-2">
            <p className="text-sm font-semibold capitalize text-gray-300">{cat}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
              {entries.map((e, i) => (
                <div key={e.campaign_id} className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                  <p className="text-gray-400 truncate">{e.name}</p>
                  <p className="font-bold mt-0.5" style={{ color: COLORS[i % COLORS.length] }}>
                    {(e.share * 100).toFixed(1)}% ({e.wins.toLocaleString()} wins)
                  </p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="category" hide />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 11 }}
                  formatter={(v: number, name: string) => [v.toLocaleString() + " wins", name]}
                />
                {entries.map((e, i) => (
                  <Bar key={e.campaign_id} dataKey={e.name} stackId="a" fill={COLORS[i % COLORS.length]}>
                    {chartData.map((_, ci) => (
                      <Cell key={ci} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </section>
  );
}
