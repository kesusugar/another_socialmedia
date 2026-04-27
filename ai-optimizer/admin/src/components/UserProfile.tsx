import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface CategoryPref {
  alpha: number;
  beta: number;
}

interface ProfileResponse {
  user_id: string;
  dominant_category: string;
  preferences: Record<string, CategoryPref>;
  eta: number;
}

const COLORS: Record<string, string> = {
  tech: "#60a5fa",
  animal: "#34d399",
  comedy: "#fbbf24",
  news: "#94a3b8",
  sports: "#f87171",
};

export function UserProfile() {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    if (!userId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/user/${encodeURIComponent(userId.trim())}/profile`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ProfileResponse = await res.json();
      setProfile(json);
    } catch (e) {
      setError(String(e));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  const chartData = profile
    ? Object.entries(profile.preferences).map(([cat, prefs]) => ({
        name: cat,
        alpha: Number(prefs.alpha.toFixed(2)),
        beta: Number(prefs.beta.toFixed(2)),
        mean: Number((prefs.alpha / (prefs.alpha + prefs.beta)).toFixed(3)),
      }))
    : [];

  return (
    <section className="bg-gray-900 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-bold">ユーザープロファイル検索</h2>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="user_id を入力"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={() => void lookup()}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
        >
          {loading ? "検索中…" : "検索"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {profile && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="bg-gray-800 rounded-lg px-4 py-2">
              <p className="text-gray-400 text-xs mb-1">最優勢カテゴリ</p>
              <p className="font-bold text-violet-400 text-lg">
                {profile.dominant_category}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg px-4 py-2">
              <p className="text-gray-400 text-xs mb-1">探索率 η</p>
              <p className="font-bold">{profile.eta.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">カテゴリ別 Beta分布 平均（α / α+β）</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151" }}
                  formatter={(v: number) => v.toFixed(3)}
                />
                <Bar dataKey="mean" name="期待値（mean）" radius={[4, 4, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={COLORS[d.name] ?? "#a78bfa"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="pb-2">Category</th>
                <th className="pb-2 text-right">α (正報酬)</th>
                <th className="pb-2 text-right">β (負報酬)</th>
                <th className="pb-2 text-right">mean</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => (
                <tr key={d.name} className="border-b border-gray-800">
                  <td className="py-1" style={{ color: COLORS[d.name] }}>{d.name}</td>
                  <td className="py-1 text-right">{d.alpha}</td>
                  <td className="py-1 text-right">{d.beta}</td>
                  <td className="py-1 text-right font-mono">{d.mean}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
