import { useState } from "react";
import { CATEGORIES } from "../types";

interface Props {
  campaignId: string;
  defaultCategory: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function AdForm({ campaignId, defaultCategory, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [bid, setBid] = useState(1.0);
  const [coldStart, setColdStart] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("タイトルを入力してください"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/advertiser/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          title: title.trim(),
          thumbnail,
          category,
          virtual_bid: bid,
          cold_start: coldStart ? 1 : 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "入稿失敗");
      }
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <h3 className="font-bold text-white">広告を入稿</h3>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="space-y-1">
        <label className="text-xs text-gray-400">タイトル *</label>
        <input
          className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 最新スマートフォン発売中"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-400">サムネイルURL (任意)</label>
        <input
          className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
          value={thumbnail}
          onChange={(e) => setThumbnail(e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">カテゴリ</label>
          <select
            className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">入札額: ¥{bid.toFixed(1)}</label>
          <input
            type="range"
            min={1.0} max={5.0} step={0.1}
            value={bid}
            onChange={(e) => setBid(Number(e.target.value))}
            className="w-full accent-blue-500 mt-2"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>1.0</span><span>5.0</span>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={coldStart}
          onChange={(e) => setColdStart(e.target.checked)}
          className="accent-blue-500"
        />
        コールドスタート（新広告として優先探索）
      </label>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm"
        >
          {loading ? "入稿中..." : "入稿する"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
