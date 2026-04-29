import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import type { Campaign } from "../types";
import { CAT_COLORS, STRATEGY_LABELS } from "../types";

function StatusBadge({ status }: { status: string }) {
  return status === "active" ? (
    <span className="text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-0.5 rounded-full">
      配信中
    </span>
  ) : (
    <span className="text-xs bg-gray-700 text-gray-400 border border-gray-600 px-2 py-0.5 rounded-full">
      停止中
    </span>
  );
}

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>予算消化</span>
        <span>
          ¥{Math.round(spent).toLocaleString()} / ¥{budget.toLocaleString()}
          {pct >= 100 && <span className="ml-1 text-red-400 font-bold">予算超過</span>}
        </span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

export function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/advertiser/campaigns");
      setCampaigns(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <p className="text-gray-500 text-center py-20">読み込み中...</p>;
  }

  const totalImpressions = campaigns.reduce((s, c) => s + (c.total_impressions ?? 0), 0);
  const activeCnt = campaigns.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-8">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "キャンペーン数", value: String(campaigns.length) },
          { label: "配信中", value: String(activeCnt) },
          { label: "総インプレッション (24h)", value: totalImpressions.toLocaleString() },
          {
            label: "平均CPA",
            value:
              campaigns.filter((c) => c.overall_cpa_yen).length > 0
                ? "¥" +
                  Math.round(
                    campaigns.reduce((s, c) => s + (c.overall_cpa_yen ?? 0), 0) /
                      campaigns.filter((c) => c.overall_cpa_yen).length
                  ).toLocaleString()
                : "—",
          },
        ].map((m) => (
          <div key={m.label} className="bg-gray-900 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{m.label}</p>
            <p className="text-2xl font-bold text-white">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">キャンペーン一覧</h2>
        <Link
          to="/campaigns/new"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg"
        >
          + 新規キャンペーン
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-gray-900 rounded-2xl p-16 text-center space-y-4">
          <p className="text-gray-400">キャンペーンがありません</p>
          <Link
            to="/campaigns/new"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg"
          >
            最初のキャンペーンを作成
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link
              key={c.campaign_id}
              to={`/campaigns/${c.campaign_id}`}
              className="block bg-gray-900 hover:bg-gray-800 rounded-2xl p-5 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="font-bold text-white">{c.name}</span>
                <StatusBadge status={c.status} />
                <span className={`text-xs font-medium capitalize ${CAT_COLORS[c.category] ?? "text-gray-400"}`}>
                  {c.category}
                </span>
                <span className="text-xs text-gray-500 ml-auto">
                  {STRATEGY_LABELS[c.bid_strategy] ?? c.bid_strategy}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-3">
                <MetricCard label="日予算" value={`¥${c.daily_budget.toLocaleString()}`} />
                <MetricCard label="目標CPA" value={`¥${c.target_cpa.toLocaleString()}`} />
                <MetricCard label="広告数" value={String(c.ad_count ?? 0)} />
                <MetricCard
                  label="IMP (24h)"
                  value={(c.total_impressions ?? 0).toLocaleString()}
                />
                <MetricCard
                  label="実績CPA"
                  value={c.overall_cpa_yen ? `¥${Math.round(c.overall_cpa_yen).toLocaleString()}` : "—"}
                />
              </div>
              <BudgetBar spent={c.spent_today ?? 0} budget={c.daily_budget} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
