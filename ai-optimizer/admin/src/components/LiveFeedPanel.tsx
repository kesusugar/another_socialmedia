import { useEffect, useRef, useState, useCallback } from "react";

interface LiveEvent {
  id: number;
  created_at: string;
  user_id: string;
  ad_id: string;
  event_type: string;
  dwell_ms: number;
  ad_title: string | null;
  campaign_name: string | null;
}

const EVENT_STYLE: Record<string, { label: string; cls: string }> = {
  impression: { label: "表示",    cls: "bg-gray-700 text-gray-300" },
  complete:   { label: "完視聴",  cls: "bg-teal-900 text-teal-300" },
  lp_click:   { label: "LP遷移", cls: "bg-blue-900 text-blue-300" },
  purchase:   { label: "購入！",  cls: "bg-green-900 text-green-300 font-bold" },
  skip:       { label: "スキップ", cls: "bg-orange-900 text-orange-300" },
  like:       { label: "いいね",  cls: "bg-pink-900 text-pink-300" },
};

function shortTime(iso: string) {
  return iso.slice(11, 19);
}

function isBot(userId: string) {
  return userId.startsWith("bot_");
}

export function LiveFeedPanel() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(0);
  const sinceId = useRef(0);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  const poll = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const res = await fetch(`/admin/events/live?limit=50&since_id=${sinceId.current}`);
      if (!res.ok) return;
      const data: LiveEvent[] = await res.json();
      if (data.length === 0) return;

      // data is DESC order; newest first — we prepend to list
      const maxId = Math.max(...data.map((e) => e.id));
      if (maxId > sinceId.current) sinceId.current = maxId;

      setEvents((prev) => {
        const merged = [...data, ...prev].slice(0, 200);
        return merged;
      });
      setCount((c) => c + data.length);
    } catch {
      // network error — ignore
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">ライブイベントフィード</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            2秒ごと更新 — 累計 {count.toLocaleString()} 件
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPaused((p) => !p);
            }}
            className={`text-xs px-3 py-1.5 rounded ${
              paused
                ? "bg-green-800 hover:bg-green-700 text-green-200"
                : "bg-gray-700 hover:bg-gray-600 text-gray-300"
            }`}
          >
            {paused ? "▶ 再開" : "⏸ 一時停止"}
          </button>
          <button
            onClick={() => {
              setEvents([]);
              setCount(0);
            }}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          >
            クリア
          </button>
        </div>
      </div>

      {/* legend */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(EVENT_STYLE).map(([k, v]) => (
          <span key={k} className={`text-xs rounded px-1.5 py-0.5 ${v.cls}`}>
            {v.label}
          </span>
        ))}
      </div>

      <div className="h-72 overflow-y-auto space-y-1 pr-1">
        {events.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">
            イベントなし — エージェントを起動するか、スワイプUIで広告を操作してください
          </p>
        ) : (
          events.map((ev) => {
            const style = EVENT_STYLE[ev.event_type] ?? { label: ev.event_type, cls: "bg-gray-800 text-gray-400" };
            return (
              <div
                key={ev.id}
                className="flex items-center gap-2 text-xs bg-gray-800 rounded px-3 py-1.5"
              >
                <span className="text-gray-500 shrink-0 font-mono w-16">{shortTime(ev.created_at)}</span>
                <span className="shrink-0">{isBot(ev.user_id) ? "🤖" : "👤"}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 ${style.cls}`}>{style.label}</span>
                <span className="text-gray-300 truncate min-w-0">
                  {ev.ad_title ?? ev.ad_id}
                  {ev.campaign_name && (
                    <span className="text-gray-500 ml-1">({ev.campaign_name})</span>
                  )}
                </span>
                {ev.dwell_ms > 0 && (
                  <span className="text-gray-600 shrink-0">{(ev.dwell_ms / 1000).toFixed(1)}s</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
