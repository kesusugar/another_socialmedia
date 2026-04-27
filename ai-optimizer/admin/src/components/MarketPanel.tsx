import { useEffect, useState } from "react";

const SCENARIOS = [
  {
    name: "シナリオ1: 予算10倍パニック",
    description: "任意のカテゴリの日予算を現在の10倍に設定。CPAが急上昇し、探索率が跳ね上がって関係ないコンテンツが配信されることを確認。",
    steps: ["予算パネルで任意カテゴリを選択", "日予算を×10にする（×2を3回）", "スワイプUIで10回スワイプ", "KPIチャートでCPAの急上昇を確認"],
  },
  {
    name: "シナリオ2: tCPA収束",
    description: "tCPAを設定して50回スワイプ。実績CPAが目標値に徐々に収束することを確認。",
    steps: ["techカテゴリで戦略=tCPA、目標=300に設定", "スワイプUIで50回スワイプ", "KPIチャートでCPAの収束ラインを確認", "PID状態（integral）が安定することを確認"],
  },
  {
    name: "シナリオ3: プロの予算スケール",
    description: "予算を10%ずつ段階的に増額。CPAを維持したまま配信量を増やせるか検証。",
    steps: ["日予算を1000から開始", "スワイプ10回 → 1100に増額を繰り返す", "CPAが急上昇しないことを確認", "競合レベルを上げて難易度を上げる"],
  },
];

export function MarketPanel() {
  const [level, setLevel] = useState(0.0);
  const [pending, setPending] = useState(0.0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/admin/competition");
      const data: { level: number } = await res.json();
      setLevel(data.level);
      setPending(data.level);
    })();
  }, []);

  async function apply() {
    const res = await fetch("/admin/competition", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: pending }),
    });
    if (res.ok) {
      setLevel(pending);
      setStatus(`競合レベルを ${(pending * 100).toFixed(0)}% に設定しました`);
      setTimeout(() => setStatus(""), 2500);
    }
  }

  const cpaMultiplier = 1 + level;

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-bold">マーケットシミュレーター</h2>

      {/* Competition slider */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="font-semibold text-sm">
            競合の激しさ — 現在:{" "}
            <span className="text-pink-400">{(level * 100).toFixed(0)}%</span>
          </label>
          <span className="text-xs text-gray-400">
            CPA ×{cpaMultiplier.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={pending}
          onChange={(e) => setPending(Number(e.target.value))}
          className="w-full accent-pink-500"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>0% 競合なし</span>
          <span className="text-pink-400 font-bold">{(pending * 100).toFixed(0)}%</span>
          <span>100% 極限競争</span>
        </div>

        <div className="bg-gray-800 rounded-lg p-3 text-xs space-y-1">
          <p className="text-gray-400">競合が高いと全CPAに乗数がかかり、獲得コストが底上げされます。</p>
          <p className="text-yellow-400">
            現在の有効CPA = 実績CPA × {cpaMultiplier.toFixed(2)}
          </p>
        </div>

        <button
          onClick={() => void apply()}
          className="bg-pink-700 hover:bg-pink-600 text-white text-sm px-4 py-2 rounded-lg"
        >
          競合レベルを適用
        </button>
        {status && <p className="text-green-400 text-sm">{status}</p>}
      </div>

      {/* Scenario cards */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-gray-300">運用シナリオガイド</h3>
        {SCENARIOS.map((s) => (
          <details key={s.name} className="bg-gray-800 rounded-xl">
            <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-blue-300 hover:text-blue-200">
              {s.name}
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-400">{s.description}</p>
              <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                {s.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
