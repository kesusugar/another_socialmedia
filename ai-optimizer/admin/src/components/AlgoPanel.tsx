import { useEffect, useState } from "react";

const CATEGORIES = ["tech", "animal", "comedy", "news", "sports"] as const;

interface EtaResponse { eta: number }

export function AlgoPanel() {
  const [eta, setEta] = useState(0.2);
  const [pendingEta, setPendingEta] = useState(0.2);
  const [bids, setBids] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, 1.0]))
  );
  const [etaStatus, setEtaStatus] = useState("");
  const [bidStatus, setBidStatus] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [resetUserId, setResetUserId] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/eta");
      const json: EtaResponse = await res.json();
      setEta(json.eta);
      setPendingEta(json.eta);
    })();
  }, []);

  async function applyEta() {
    const res = await fetch("/admin/eta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eta: pendingEta }),
    });
    if (res.ok) {
      setEta(pendingEta);
      setEtaStatus(`η を ${pendingEta.toFixed(2)} に設定しました`);
      setTimeout(() => setEtaStatus(""), 3000);
    }
  }

  async function applyBid(category: string) {
    const bid = bids[category] ?? 1.0;
    const res = await fetch("/admin/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, bid }),
    });
    if (res.ok) {
      setBidStatus(`${category} の bid を ${bid.toFixed(1)} に設定しました`);
      setTimeout(() => setBidStatus(""), 3000);
    }
  }

  async function resetLearning() {
    const body = resetUserId ? { user_id: resetUserId } : {};
    const res = await fetch("/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setResetStatus(resetUserId ? `${resetUserId} をリセットしました` : "全ユーザーをリセットしました");
      setTimeout(() => setResetStatus(""), 3000);
    }
  }

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-8">
      <h2 className="text-lg font-bold">アルゴリズム制御パネル</h2>

      {/* Eta slider */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="font-semibold text-sm">
            探索率 η (eta) — 現在: <span className="text-blue-400">{eta.toFixed(2)}</span>
          </label>
          <span className="text-xs text-gray-400">0=活用 / 1=探索</span>
        </div>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={pendingEta}
          onChange={(e) => setPendingEta(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>0.0 完全活用</span>
          <span className="text-blue-400 font-bold">{pendingEta.toFixed(2)}</span>
          <span>1.0 完全探索</span>
        </div>
        <button
          onClick={() => void applyEta()}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg"
        >
          η を適用
        </button>
        {etaStatus && <p className="text-green-400 text-sm">{etaStatus}</p>}
      </div>

      {/* Virtual bid per category */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Virtual Bid（カテゴリ別）</h3>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="w-20 text-sm capitalize">{cat}</span>
            <input
              type="range"
              min={1.0} max={5.0} step={0.1}
              value={bids[cat] ?? 1.0}
              onChange={(e) =>
                setBids((prev) => ({ ...prev, [cat]: Number(e.target.value) }))
              }
              className="flex-1 accent-orange-400"
            />
            <span className="w-8 text-right text-sm text-orange-400">
              {(bids[cat] ?? 1.0).toFixed(1)}
            </span>
            <button
              onClick={() => void applyBid(cat)}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs px-3 py-1 rounded"
            >
              適用
            </button>
          </div>
        ))}
        {bidStatus && <p className="text-green-400 text-sm">{bidStatus}</p>}
      </div>

      {/* Reset */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">学習リセット</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="user_id（空欄=全員）"
            value={resetUserId}
            onChange={(e) => setResetUserId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => void resetLearning()}
            className="bg-red-700 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg"
          >
            β分布をリセット
          </button>
        </div>
        {resetStatus && <p className="text-green-400 text-sm">{resetStatus}</p>}
      </div>
    </section>
  );
}
