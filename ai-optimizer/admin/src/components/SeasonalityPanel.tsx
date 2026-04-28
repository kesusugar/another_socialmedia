import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

type Metric = "cpm" | "ctr" | "cvr";

interface SeasonalityState {
  cpm_by_hour: number[];
  ctr_by_hour: number[];
  cvr_by_hour: number[];
  cpm_by_dow:  number[];
  ctr_by_dow:  number[];
  cvr_by_dow:  number[];
  enabled:     boolean;
  current_hour: number;
  current_dow:  number;
  current_multipliers: { cpm: number; ctr: number; cvr: number };
}

const METRIC_LABELS: Record<Metric, string> = {
  cpm: "CPM（コスト）",
  ctr: "CTR（クリック率）",
  cvr: "CVR（転換率）",
};

const METRIC_COLORS: Record<Metric, string> = {
  cpm: "#f87171",
  ctr: "#60a5fa",
  cvr: "#34d399",
};

const DOW_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

function MultiplierBadge({ val }: { val: number }) {
  const color = val > 1.15 ? "text-red-400" : val < 0.85 ? "text-blue-400" : "text-green-400";
  return <span className={`font-bold ${color}`}>×{val.toFixed(2)}</span>;
}

export function SeasonalityPanel() {
  const [state, setState] = useState<SeasonalityState | null>(null);
  const [tab, setTab] = useState<Metric>("cpm");
  const [editHour, setEditHour] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/admin/seasonality");
      setState(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  async function toggleEnabled() {
    if (!state) return;
    await fetch("/admin/seasonality", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !state.enabled }),
    });
    void load();
  }

  async function saveHour() {
    if (!state || editHour === null) return;
    const v = Math.max(0.1, Math.min(3.0, parseFloat(editVal) || 1.0));
    const key = `${tab}_by_hour` as keyof SeasonalityState;
    const arr = [...(state[key] as number[])];
    arr[editHour] = v;
    await fetch("/admin/seasonality", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: arr }),
    });
    setEditHour(null);
    void load();
  }

  async function saveDow(idx: number, val: number) {
    if (!state) return;
    const v = Math.max(0.1, Math.min(3.0, val));
    const key = `${tab}_by_dow` as keyof SeasonalityState;
    const arr = [...(state[key] as number[])];
    arr[idx] = v;
    await fetch("/admin/seasonality", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: arr }),
    });
    void load();
  }

  async function resetToDefault() {
    await fetch("/admin/seasonality/reset", { method: "POST" });
    setStatus("デフォルトに戻しました");
    setTimeout(() => setStatus(""), 2500);
    void load();
  }

  if (!state) return <section className="bg-gray-900 rounded-2xl p-6"><p className="text-gray-500 text-sm">読み込み中...</p></section>;

  const hourKey = `${tab}_by_hour` as keyof SeasonalityState;
  const dowKey  = `${tab}_by_dow`  as keyof SeasonalityState;
  const hourData = (state[hourKey] as number[]).map((v, h) => ({ hour: `${h}時`, value: v, h }));
  const dowData  = (state[dowKey]  as number[]).map((v, d) => ({ label: DOW_LABELS[d], value: v, d }));

  const curMult = state.current_multipliers[tab];

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">季節性シミュレーター</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            時間帯・曜日ごとにCPM/CTR/CVRの乗数を設定します
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void toggleEnabled()}
            className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
              state.enabled
                ? "bg-green-900/50 border-green-600 text-green-300"
                : "bg-gray-800 border-gray-600 text-gray-400"
            }`}
          >
            {state.enabled ? "有効" : "無効"}
          </button>
          <button
            onClick={() => void resetToDefault()}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded"
          >
            デフォルトに戻す
          </button>
        </div>
      </div>

      {status && <p className="text-green-400 text-sm">{status}</p>}

      {/* 現在の乗数 */}
      <div className="bg-gray-800 rounded-xl p-3 flex flex-wrap gap-4 text-sm">
        <span className="text-gray-400">現在 ({state.current_hour}時・{DOW_LABELS[state.current_dow]}曜)</span>
        {(["cpm", "ctr", "cvr"] as Metric[]).map((m) => (
          <span key={m}>
            <span className="text-gray-500 mr-1">{m.toUpperCase()}</span>
            <MultiplierBadge val={state.current_multipliers[m]} />
          </span>
        ))}
      </div>

      {/* タブ */}
      <div className="flex gap-1">
        {(["cpm", "ctr", "cvr"] as Metric[]).map((m) => (
          <button
            key={m}
            onClick={() => setTab(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === m
                ? "text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            style={tab === m ? { backgroundColor: METRIC_COLORS[m] + "33", border: `1px solid ${METRIC_COLORS[m]}` } : {}}
          >
            {m.toUpperCase()}
          </button>
        ))}
        <span className="ml-2 text-xs text-gray-500 self-center">
          {METRIC_LABELS[tab]} — 現在: <MultiplierBadge val={curMult} />
        </span>
      </div>

      {/* 24時間バーチャート */}
      <div>
        <p className="text-xs text-gray-500 mb-2">時間帯別乗数（バーをクリックして編集）</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={hourData} onClick={(d) => {
            if (d?.activePayload) {
              const h = (d.activePayload[0].payload as { h: number }).h;
              setEditHour(h);
              setEditVal(String(hourData[h].value));
            }
          }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="hour" tick={{ fontSize: 9 }} stroke="#6b7280" interval={2} />
            <YAxis domain={[0, 2.5]} tick={{ fontSize: 10 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", fontSize: 12 }}
              formatter={(v: number) => [`×${v.toFixed(2)}`, METRIC_LABELS[tab]]}
            />
            <ReferenceLine y={1} stroke="#6b7280" strokeDasharray="4 2" />
            <ReferenceLine y={1} x={`${state.current_hour}時`} stroke="#facc15" strokeWidth={2} />
            <Bar dataKey="value" fill={METRIC_COLORS[tab]} radius={[2, 2, 0, 0]} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>

        {editHour !== null && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-400">{editHour}時の{tab.toUpperCase()}乗数:</span>
            <input
              type="number"
              step={0.05}
              min={0.1}
              max={3.0}
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              className="bg-gray-800 rounded px-2 py-1 text-sm w-20"
              autoFocus
            />
            <button
              onClick={() => void saveHour()}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded"
            >
              保存
            </button>
            <button
              onClick={() => setEditHour(null)}
              className="text-xs text-gray-400 hover:text-white"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      {/* 曜日スライダー */}
      <div>
        <p className="text-xs text-gray-500 mb-2">曜日別乗数</p>
        <div className="grid grid-cols-7 gap-1">
          {dowData.map(({ label, value, d }) => (
            <div key={d} className={`text-center space-y-1 ${d === state.current_dow ? "ring-1 ring-yellow-400 rounded" : ""}`}>
              <p className="text-xs text-gray-400">{label}</p>
              <input
                type="range"
                min={0.5} max={2.0} step={0.05}
                value={value}
                onChange={(e) => void saveDow(d, Number(e.target.value))}
                className="w-full"
                style={{ accentColor: METRIC_COLORS[tab] }}
                orient="vertical"
              />
              <p className="text-xs font-bold" style={{ color: METRIC_COLORS[tab] }}>
                ×{value.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
