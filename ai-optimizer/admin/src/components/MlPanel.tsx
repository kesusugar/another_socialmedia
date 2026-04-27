import { useEffect, useState, useCallback } from "react";

type Strategy = "bayesian" | "ctr_lr" | "mf" | "session_gru";

const STRATEGY_LABELS: Record<Strategy, string> = {
  bayesian:    "Thompson Sampling（ベイズ）",
  ctr_lr:      "CTR ロジスティック回帰",
  mf:          "Matrix Factorization（協調フィルタリング）",
  session_gru: "Session GRU（次カテゴリ予測）",
};

const STRATEGY_DESC: Record<Strategy, string> = {
  bayesian:
    "既存のβ分布 + Thompson Sampling。ML未学習でも動作するフォールバック。",
  ctr_lr:
    "18次元特徴量（ユーザー嗜好・動画ベクトル・時刻）からクリック率を予測するNN。",
  mf:
    "ユーザーIDと動画IDを16次元埋め込みに変換し内積でスコアを計算。協調フィルタリング。",
  session_gru:
    "直前10件のイベント系列をGRUに通し、次に見たいカテゴリを確率分布で予測。",
};

interface PerModelStatus {
  ready: boolean;
  training_count: number;
  last_trained: string;
  last_loss: number;
  last_accuracy: number;
  num_users?: number;
  num_ads?: number;
}

interface MlStatusResponse {
  active_strategy: Strategy;
  models: {
    ctr_lr:      PerModelStatus;
    mf:          PerModelStatus;
    session_gru: PerModelStatus;
  };
}

const MODEL_KEYS = ["ctr_lr", "mf", "session_gru"] as const;
const MODEL_NAMES: Record<string, string> = {
  ctr_lr:      "CTR LR",
  mf:          "Matrix Factorization",
  session_gru: "Session GRU",
};
const MODEL_DESC: Record<string, string> = {
  ctr_lr:      "Linear(18→32→1) + Sigmoid",
  mf:          "Embedding(user,16) × Embedding(ad,16)",
  session_gru: "GRU(10→32) → Linear(32→5) → Softmax",
};

function AccuracyBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-10 text-right">{pct}%</span>
    </div>
  );
}

export function MlPanel() {
  const [status, setStatus] = useState<MlStatusResponse | null>(null);
  const [pendingStrategy, setPendingStrategy] = useState<Strategy>("bayesian");
  const [applyMsg, setApplyMsg] = useState("");
  const [trainMsg, setTrainMsg] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/admin/ml/status");
      const data: MlStatusResponse = await res.json();
      setStatus(data);
      setPendingStrategy(data.active_strategy);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function applyStrategy() {
    await fetch("/admin/ml/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: pendingStrategy }),
    });
    setApplyMsg(`戦略を「${STRATEGY_LABELS[pendingStrategy]}」に変更しました`);
    setTimeout(() => setApplyMsg(""), 3000);
    void fetchStatus();
  }

  async function triggerTrain() {
    const res = await fetch("/admin/ml/train", { method: "POST" });
    if (res.ok) {
      setTrainMsg("バックグラウンドで学習を開始しました...");
      setTimeout(() => setTrainMsg(""), 6000);
    }
  }

  const active = status?.active_strategy ?? "bayesian";

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">ML モデルパネル</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            現在: <span className="text-violet-400 font-semibold">{STRATEGY_LABELS[active]}</span>
          </p>
        </div>
        <button
          onClick={() => void triggerTrain()}
          className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          今すぐ学習
        </button>
      </div>

      {trainMsg && <p className="text-green-400 text-sm">{trainMsg}</p>}

      {/* Strategy selector */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">推薦戦略を切り替える</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((s) => (
            <button
              key={s}
              onClick={() => setPendingStrategy(s)}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                pendingStrategy === s
                  ? "border-violet-500 bg-violet-900/30 text-violet-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
              }`}
            >
              <p className="font-semibold mb-0.5">{STRATEGY_LABELS[s]}</p>
              <p className="text-gray-500 text-[10px] leading-tight">{STRATEGY_DESC[s]}</p>
            </button>
          ))}
        </div>
        <button
          onClick={() => void applyStrategy()}
          className="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg"
        >
          戦略を適用
        </button>
        {applyMsg && <p className="text-green-400 text-sm">{applyMsg}</p>}
      </div>

      {/* Model status cards */}
      {status && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">モデル学習状態</h3>
          {MODEL_KEYS.map((key) => {
            const m = status.models[key];
            return (
              <div
                key={key}
                className={`rounded-xl p-4 space-y-2 border ${
                  m.ready
                    ? "bg-gray-800 border-gray-700"
                    : "bg-gray-850 border-gray-800 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">{MODEL_NAMES[key]}</span>
                    <p className="text-[10px] text-gray-500 font-mono">{MODEL_DESC[key]}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      m.ready
                        ? "bg-green-900 text-green-300"
                        : "bg-gray-700 text-gray-500"
                    }`}
                  >
                    {m.ready ? "Ready" : "未学習"}
                  </span>
                </div>

                {m.ready && (
                  <>
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Accuracy</span>
                        <span className="text-yellow-400">
                          Loss {m.last_loss.toFixed(4)}
                        </span>
                      </div>
                      <AccuracyBar value={m.last_accuracy} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
                      <span>学習回数: <span className="text-white">{m.training_count}</span></span>
                      {m.num_users !== undefined && (
                        <span>
                          ユーザー: <span className="text-white">{m.num_users}</span>
                          {" / "}広告: <span className="text-white">{m.num_ads}</span>
                        </span>
                      )}
                      {m.last_trained && (
                        <span>
                          最終: <span className="text-white">
                            {new Date(m.last_trained).toLocaleTimeString("ja-JP")}
                          </span>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <p className="text-xs text-gray-600">
            ※ 20イベントごとに自動学習 / 「今すぐ学習」で手動トリガー可能
          </p>
        </div>
      )}
    </section>
  );
}
