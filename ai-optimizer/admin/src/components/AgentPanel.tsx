import { useEffect, useState, useCallback } from "react";

interface AgentState {
  agent_id: string;
  persona_name: string;
  user_id: string;
  swipe_count: number;
  event_counts: Record<string, number>;
  running: boolean;
  started_at: string;
  last_event_at: string;
  error: string;
}

interface PersonaInfo {
  name: string;
  description: string;
  preferred_categories: Record<string, number>;
  behavior_style: string;
  swipe_interval_sec: number;
  fatigue_rate: number;
}

const STYLE_LABELS: Record<string, string> = {
  binge: "Binge",
  picky: "Picky",
  random: "Random",
};

const STYLE_COLORS: Record<string, string> = {
  binge: "text-orange-400",
  picky: "text-blue-400",
  random: "text-purple-400",
};

function EventBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <span className="text-gray-600 text-xs">まだなし</span>;
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-green-400">✓{counts.complete ?? 0}</span>
      <span className="text-blue-400">LP{counts.lp_click ?? 0}</span>
      <span className="text-emerald-300">CV{counts.purchase ?? 0}</span>
      <span className="text-red-400">→{counts.skip ?? 0}</span>
      <span className="text-gray-500 ml-1">計{total}</span>
    </div>
  );
}

function AgentCard({ agent, onStop }: { agent: AgentState; onStop: (id: string) => void }) {
  const elapsed = agent.started_at
    ? Math.floor((Date.now() - new Date(agent.started_at).getTime()) / 1000)
    : 0;
  const rate = elapsed > 0 ? (agent.swipe_count / elapsed).toFixed(2) : "0.00";

  return (
    <div className={`bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${!agent.running ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-500">{agent.agent_id.slice(-8)}</span>
          <span className="text-sm font-semibold capitalize text-gray-200">{agent.persona_name}</span>
          {agent.running
            ? <span className="text-xs bg-green-900/60 text-green-300 rounded px-1.5 py-0.5">稼働中</span>
            : <span className="text-xs bg-gray-700 text-gray-400 rounded px-1.5 py-0.5">停止</span>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">↑{agent.swipe_count}回 ({rate}/s)</span>
          <EventBar counts={agent.event_counts} />
        </div>
        {agent.error && (
          <p className="text-xs text-red-400 truncate">{agent.error}</p>
        )}
      </div>
      {agent.running && (
        <button
          onClick={() => onStop(agent.agent_id)}
          className="shrink-0 text-xs bg-red-900 hover:bg-red-800 text-red-200 px-2 py-1 rounded"
        >
          停止
        </button>
      )}
    </div>
  );
}

export function AgentPanel() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("");
  const [count, setCount] = useState(1);
  const [bulkCount, setBulkCount] = useState(5);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/admin/agents/status");
      const data: AgentState[] = await res.json();
      setAgents(data);
    } catch (e) {
      console.error("agents status fetch error", e);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/admin/agents/personas");
        const data: PersonaInfo[] = await res.json();
        setPersonas(data);
        if (data.length > 0) setSelectedPersona(data[0].name);
      } catch (e) {
        console.error("personas fetch error", e);
      }
    })();
    void fetchStatus();
    const id = setInterval(() => void fetchStatus(), 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function startAgents() {
    if (!selectedPersona) return;
    setLoading(true);
    try {
      const res = await fetch("/admin/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_name: selectedPersona, count }),
      });
      const data = await res.json();
      setStatus(`${data.started.length}台の ${selectedPersona} を起動しました`);
      setTimeout(() => setStatus(""), 3000);
      void fetchStatus();
    } finally {
      setLoading(false);
    }
  }

  async function stopAgent(agent_id: string) {
    await fetch("/admin/agents/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id }),
    });
    void fetchStatus();
  }

  async function startAllPersonas() {
    if (personas.length === 0) return;
    setLoading(true);
    let total = 0;
    try {
      for (const p of personas) {
        const res = await fetch("/admin/agents/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona_name: p.name, count: bulkCount }),
        });
        const data = await res.json();
        total += data.started.length;
      }
      setStatus(`全ペルソナ ${personas.length}種 × ${bulkCount}台 = ${total}台を起動しました`);
      setTimeout(() => setStatus(""), 4000);
      void fetchStatus();
    } finally {
      setLoading(false);
    }
  }

  async function stopAll() {
    const res = await fetch("/admin/agents/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: null }),
    });
    const data = await res.json();
    setStatus(`${data.stopped_count}台を停止しました`);
    setTimeout(() => setStatus(""), 3000);
    void fetchStatus();
  }

  const running = agents.filter((a) => a.running);
  const currentPersona = personas.find((p) => p.name === selectedPersona);

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">仮想ユーザーエージェント</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ペルソナを持つボットが自動スワイプしてKPIを動かします
          </p>
        </div>
        {running.length > 0 && (
          <button
            onClick={() => void stopAll()}
            className="text-xs bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded"
          >
            全停止 ({running.length}台)
          </button>
        )}
      </div>

      {status && <p className="text-green-400 text-sm">{status}</p>}

      {/* Launch controls */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">ボットを起動</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            className="flex-1 min-w-36 bg-gray-700 rounded px-2 py-1.5 text-sm"
          >
            {personas.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1.5 text-sm w-20"
          >
            {[1, 2, 3, 5, 10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}台</option>
            ))}
          </select>
          <button
            onClick={() => void startAgents()}
            disabled={loading || !selectedPersona}
            className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
          >
            起動
          </button>
        </div>
        <div className="flex items-center gap-2 border-t border-gray-700 pt-3">
          <span className="text-xs text-gray-400 shrink-0">全ペルソナ一括:</span>
          <select
            value={bulkCount}
            onChange={(e) => setBulkCount(Number(e.target.value))}
            className="bg-gray-700 rounded px-2 py-1.5 text-sm w-20"
          >
            {[1, 2, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}台ずつ</option>
            ))}
          </select>
          <button
            onClick={() => void startAllPersonas()}
            disabled={loading}
            className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded"
          >
            全ペルソナ起動 ({personas.length}種 × {bulkCount}台)
          </button>
        </div>

        {/* Persona preview */}
        {currentPersona && (
          <div className="text-xs text-gray-400 space-y-1 border-t border-gray-700 pt-2">
            <p className="text-gray-300">{currentPersona.description}</p>
            <div className="flex gap-3 flex-wrap">
              <span>
                スタイル:{" "}
                <span className={STYLE_COLORS[currentPersona.behavior_style] ?? "text-gray-300"}>
                  {STYLE_LABELS[currentPersona.behavior_style] ?? currentPersona.behavior_style}
                </span>
              </span>
              <span>間隔: {currentPersona.swipe_interval_sec}秒</span>
              <span>疲労率: {(currentPersona.fatigue_rate * 100).toFixed(0)}%</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(currentPersona.preferred_categories)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, w]) => (
                  <span key={cat} className="bg-gray-700 rounded px-1.5 py-0.5 capitalize">
                    {cat} {(w * 100).toFixed(0)}%
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Active agents */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-300">
          稼働中 ({running.length}台)
          {agents.length > running.length && (
            <span className="text-gray-500 font-normal ml-2">
              + 停止済 {agents.length - running.length}台
            </span>
          )}
        </h3>
        {agents.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">
            エージェントがいません。ボットを起動してください。
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <AgentCard key={a.agent_id} agent={a} onStop={(id) => void stopAgent(id)} />
            ))}
          </div>
        )}
      </div>

      {/* Persona guide */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-300">ペルソナガイド</h3>
        {personas.map((p) => (
          <details key={p.name} className="bg-gray-800 rounded-xl">
            <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-indigo-300 hover:text-indigo-200">
              {p.name}
              <span className={`ml-2 text-xs font-normal ${STYLE_COLORS[p.behavior_style] ?? ""}`}>
                [{STYLE_LABELS[p.behavior_style] ?? p.behavior_style}]
              </span>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-gray-400">{p.description}</p>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(p.preferred_categories)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, w]) => (
                    <span key={cat} className="bg-gray-700 rounded px-1.5 py-0.5 text-xs capitalize">
                      {cat} {(w * 100).toFixed(0)}%
                    </span>
                  ))}
              </div>
              <p className="text-xs text-gray-500">
                スワイプ間隔 {p.swipe_interval_sec}s / 疲労率 {(p.fatigue_rate * 100).toFixed(0)}%
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
