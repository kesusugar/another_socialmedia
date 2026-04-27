import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES, STRATEGY_LABELS } from "../types";
import { CpaSimulator } from "../components/CpaSimulator";

export function NewCampaign() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("tech");
  const [budget, setBudget] = useState(1000);
  const [strategy, setStrategy] = useState("manual");
  const [targetCpa, setTargetCpa] = useState(500);
  const [bid, setBid] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("キャンペーン名を入力してください"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/advertiser/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          daily_budget: budget,
          bid_strategy: strategy,
          target_cpa: targetCpa,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "作成失敗");
      }
      const data: { campaign_id: string } = await res.json();
      navigate(`/campaigns/${data.campaign_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">新規キャンペーン作成</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <form onSubmit={(e) => void submit(e)} className="bg-gray-900 rounded-2xl p-6 space-y-5">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="space-y-1">
            <label className="text-xs text-gray-400">キャンペーン名 *</label>
            <input
              className="w-full bg-gray-800 rounded-lg px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: スポーツ用品プロモーション"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">ターゲットカテゴリ</label>
            <select
              className="w-full bg-gray-800 rounded-lg px-3 py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">日予算 (¥)</label>
            <input
              type="number"
              min={100}
              step={100}
              className="w-full bg-gray-800 rounded-lg px-3 py-2"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">入札戦略</label>
            <select
              className="w-full bg-gray-800 rounded-lg px-3 py-2"
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
              type="number"
              min={10}
              step={10}
              className="w-full bg-gray-800 rounded-lg px-3 py-2"
              value={targetCpa}
              onChange={(e) => setTargetCpa(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">
              シミュレーター用入札額: ¥{bid.toFixed(1)}
            </label>
            <input
              type="range"
              min={1.0} max={5.0} step={0.1}
              value={bid}
              onChange={(e) => setBid(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>1.0（低コスト）</span><span>5.0（積極入札）</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-semibold"
          >
            {loading ? "作成中..." : "キャンペーンを作成"}
          </button>
        </form>

        {/* CPA Simulator */}
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            入札額・目標CPAを変えると推定CPAがリアルタイムで更新されます。
          </p>
          <CpaSimulator
            category={category}
            bid={bid}
            targetCpa={targetCpa}
            bidStrategy={strategy}
          />

          <div className="bg-gray-900 rounded-xl p-4 space-y-2 text-xs text-gray-400">
            <p className="font-semibold text-gray-300">シミュレーターについて</p>
            <p>過去60分の実績CTR・eCVRをベースに推定しています。</p>
            <p>競合レベルが高いほどCPAは上昇します（管理画面で設定）。</p>
            <p>実績データがない場合はデフォルト値（CTR=5%、eCVR=2%）を使用します。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
