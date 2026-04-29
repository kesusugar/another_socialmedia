import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type { Campaign, Ad } from "../types";
import { STRATEGY_LABELS } from "../types";
import { CampaignKpiChart } from "../components/CampaignKpiChart";
import { CpaSimulator } from "../components/CpaSimulator";
import { AdForm } from "../components/AdForm";

function AdRow({ ad, onDelete }: { ad: Ad; onDelete: (id: string) => void }) {
  const [kpiText, setKpiText] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/advertiser/ads/${ad.ad_id}/kpi?minutes=1440`);
        const k = await res.json();
        setKpiText(
          `IMP ${k.impressions} / CTR ${(k.ctr * 100).toFixed(1)}% / CPA ${
            k.cpa > 0 ? "¥" + k.cpa.toLocaleString() : "—"
          }`
        );
      } catch {
        //
      }
    })();
  }, [ad.ad_id]);

  async function handleDelete() {
    if (!confirm(`「${ad.title}」を削除しますか？`)) return;
    await fetch(`/advertiser/ads/${ad.ad_id}`, { method: "DELETE" });
    onDelete(ad.ad_id);
  }

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{ad.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          <span className="capitalize">{ad.category}</span>
          {" · "}入札 {ad.virtual_bid.toFixed(1)}
          {ad.cold_start ? " · 🆕 コールドスタート" : ""}
          {kpiText && <> · {kpiText}</>}
        </p>
      </div>
      <button
        onClick={() => void handleDelete()}
        className="text-xs text-red-400 hover:text-red-300 shrink-0"
      >
        削除
      </button>
    </div>
  );
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState(false);
  const [showAdForm, setShowAdForm] = useState(false);
  const [status, setStatus] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(1000);
  const [strategy, setStrategy] = useState("manual");
  const [targetCpa, setTargetCpa] = useState(500);
  const [simBid, setSimBid] = useState(1.0);
  const [campStatus, setCampStatus] = useState("active");

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/advertiser/campaigns/${id}`);
      if (res.status === 404) { navigate("/"); return; }
      const data: Campaign & { ads: Ad[] } = await res.json();
      setCampaign(data);
      setAds(data.ads ?? []);
      setName(data.name);
      setBudget(data.daily_budget);
      setStrategy(data.bid_strategy);
      setTargetCpa(data.target_cpa);
      setCampStatus(data.status);
    } catch (e) {
      console.error(e);
    }
  }, [id, navigate]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  async function saveEdits() {
    if (!id) return;
    await fetch(`/advertiser/campaigns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        daily_budget: budget,
        bid_strategy: strategy,
        target_cpa: targetCpa,
        status: campStatus,
      }),
    });
    setEditing(false);
    setStatus("保存しました");
    setTimeout(() => setStatus(""), 2500);
    void loadCampaign();
  }

  async function deleteCampaign() {
    if (!id || !confirm("このキャンペーンを削除しますか？")) return;
    await fetch(`/advertiser/campaigns/${id}`, { method: "DELETE" });
    navigate("/");
  }

  if (!campaign) {
    return <p className="text-gray-500 text-center py-20">読み込み中...</p>;
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/" className="hover:text-white">ダッシュボード</Link>
        <span>/</span>
        <span className="text-white">{campaign.name}</span>
      </div>

      {status && <p className="text-green-400 text-sm">{status}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Campaign settings */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">キャンペーン設定</h2>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
                >
                  編集
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={() => void saveEdits()}
                    className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
                  >
                    キャンセル
                  </button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">キャンペーン名</label>
                  <input
                    className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">日予算 (¥)</label>
                  <input
                    type="number" min={100} step={100}
                    className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">入札戦略</label>
                  <select
                    className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                  >
                    {Object.entries(STRATEGY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">目標CPA (¥)</label>
                  <input
                    type="number" min={10} step={10}
                    className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
                    value={targetCpa}
                    onChange={(e) => setTargetCpa(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">ステータス</label>
                  <select
                    className="w-full bg-gray-800 rounded px-2 py-1.5 text-sm"
                    value={campStatus}
                    onChange={(e) => setCampStatus(e.target.value)}
                  >
                    <option value="active">配信中</option>
                    <option value="paused">停止中</option>
                  </select>
                </div>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  ["カテゴリ", <span className="capitalize">{campaign.category}</span>],
                  ["日予算", `¥${campaign.daily_budget.toLocaleString()}`],
                  ["入札戦略", STRATEGY_LABELS[campaign.bid_strategy] ?? campaign.bid_strategy],
                  ["目標CPA", `¥${campaign.target_cpa.toLocaleString()}`],
                  ["ステータス", campaign.status === "active" ? "配信中" : "停止中"],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="text-white font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Budget meter */}
          {(() => {
            const spent = campaign.spent_today ?? 0;
            const pct = campaign.daily_budget > 0 ? Math.min((spent / campaign.daily_budget) * 100, 100) : 0;
            const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500";
            return (
              <div className="bg-gray-900 rounded-2xl p-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-bold">予算消化</span>
                  <span className="text-gray-400">{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>消化額: ¥{Math.round(spent).toLocaleString()}</span>
                  <span>日予算: ¥{campaign.daily_budget.toLocaleString()}</span>
                </div>
                {pct >= 100 && (
                  <p className="text-xs text-red-400 font-bold">⚠ 予算超過 — 配信が制限される可能性があります</p>
                )}
              </div>
            );
          })()}

          {/* CPA Simulator */}
          <div className="bg-gray-900 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm">CPA シミュレーター</h3>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">
                テスト入札額: {simBid.toFixed(1)}
              </label>
              <input
                type="range" min={1.0} max={5.0} step={0.1}
                value={simBid}
                onChange={(e) => setSimBid(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <CpaSimulator
              category={campaign.category}
              bid={simBid}
              targetCpa={campaign.target_cpa}
              bidStrategy={campaign.bid_strategy}
            />
          </div>

          <button
            onClick={() => void deleteCampaign()}
            className="w-full text-xs bg-red-900/40 hover:bg-red-900/70 border border-red-800 text-red-300 py-2 rounded-lg"
          >
            キャンペーンを削除
          </button>
        </div>

        {/* Right column: KPI + Ads */}
        <div className="lg:col-span-2 space-y-6">
          <CampaignKpiChart campaignId={campaign.campaign_id} />

          {/* Ad list */}
          <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">広告 ({ads.length}本)</h3>
              <button
                onClick={() => setShowAdForm(!showAdForm)}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
              >
                {showAdForm ? "キャンセル" : "+ 広告を入稿"}
              </button>
            </div>

            {showAdForm && (
              <div className="bg-gray-800 rounded-xl p-4">
                <AdForm
                  campaignId={campaign.campaign_id}
                  defaultCategory={campaign.category}
                  onCreated={() => {
                    setShowAdForm(false);
                    void loadCampaign();
                  }}
                  onCancel={() => setShowAdForm(false)}
                />
              </div>
            )}

            {ads.length === 0 && !showAdForm ? (
              <p className="text-gray-500 text-sm text-center py-6">
                広告がありません。「+ 広告を入稿」から追加してください。
              </p>
            ) : (
              <div className="space-y-2">
                {ads.map((a) => (
                  <AdRow
                    key={a.ad_id}
                    ad={a}
                    onDelete={(del) => setAds((prev) => prev.filter((x) => x.ad_id !== del))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
