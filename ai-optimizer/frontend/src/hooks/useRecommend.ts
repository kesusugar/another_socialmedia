import { useState, useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";

export interface AdCard {
  ad_id: string;
  category: string;
  title: string;
  thumbnail: string;
  score: number;
  sampled_at: string;
  is_organic: boolean;
  cvr_rate?: number;
}

const ORGANIC_CONTENT: Omit<AdCard, "sampled_at">[] = [
  { ad_id: "org_0",  is_organic: true, category: "comedy",  title: "深夜に笑いが止まらないシリーズ", thumbnail: "", score: 0 },
  { ad_id: "org_1",  is_organic: true, category: "animal",  title: "柴犬が初めてバナナを見た反応", thumbnail: "", score: 0 },
  { ad_id: "org_2",  is_organic: true, category: "tech",    title: "ChatGPTに無理難題を頼んでみた", thumbnail: "", score: 0 },
  { ad_id: "org_3",  is_organic: true, category: "sports",  title: "プロサーファーの超人的バランス感覚", thumbnail: "", score: 0 },
  { ad_id: "org_4",  is_organic: true, category: "news",    title: "今日の気になるニュース5選", thumbnail: "", score: 0 },
  { ad_id: "org_5",  is_organic: true, category: "comedy",  title: "上司のモノマネが完璧すぎる件", thumbnail: "", score: 0 },
  { ad_id: "org_6",  is_organic: true, category: "animal",  title: "猫が鏡を見て戸惑う姿が可愛すぎ", thumbnail: "", score: 0 },
  { ad_id: "org_7",  is_organic: true, category: "tech",    title: "3Dプリンターで作った驚きのアイテム", thumbnail: "", score: 0 },
  { ad_id: "org_8",  is_organic: true, category: "sports",  title: "バスケのトリック3Pが神がかり", thumbnail: "", score: 0 },
  { ad_id: "org_9",  is_organic: true, category: "news",    title: "知らないと損するライフハック集", thumbnail: "", score: 0 },
  { ad_id: "org_10", is_organic: true, category: "comedy",  title: "関西弁でシェイクスピアを語るとこうなる", thumbnail: "", score: 0 },
  { ad_id: "org_11", is_organic: true, category: "animal",  title: "ウサギが野菜を食べるASMR", thumbnail: "", score: 0 },
  { ad_id: "org_12", is_organic: true, category: "tech",    title: "AIで作曲したらプロ級の曲ができた", thumbnail: "", score: 0 },
  { ad_id: "org_13", is_organic: true, category: "sports",  title: "テニスの壁打ち最長記録に挑戦", thumbnail: "", score: 0 },
  { ad_id: "org_14", is_organic: true, category: "news",    title: "世界のユニークな法律TOP10", thumbnail: "", score: 0 },
  { ad_id: "org_15", is_organic: true, category: "comedy",  title: "エレベーターで絶対やってはいけない事", thumbnail: "", score: 0 },
  { ad_id: "org_16", is_organic: true, category: "animal",  title: "大型犬が子猫に完全敗北する瞬間", thumbnail: "", score: 0 },
  { ad_id: "org_17", is_organic: true, category: "tech",    title: "電気代を半分にした節電テク", thumbnail: "", score: 0 },
  { ad_id: "org_18", is_organic: true, category: "sports",  title: "ランニング初心者が1ヶ月で10km走れた方法", thumbnail: "", score: 0 },
  { ad_id: "org_19", is_organic: true, category: "news",    title: "街中でよく見るあの看板の意味", thumbnail: "", score: 0 },
];

const API = "";

function getUserId(): string {
  let id = localStorage.getItem("user_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("user_id", id);
  }
  return id;
}

async function fetchAd(userId: string): Promise<AdCard> {
  const res = await fetch(`${API}/recommend?user_id=${userId}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json() as Promise<AdCard>;
}

async function sendEvent(
  userId: string,
  adId: string,
  eventType: "complete" | "skip" | "like" | "impression" | "lp_click" | "purchase",
  dwellMs: number,
  completion: number
): Promise<void> {
  await fetch(`${API}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      ad_id: adId,
      event_type: eventType,
      dwell_ms: dwellMs,
      completion,
    }),
  });
}

function getOrganicCard(index: number): AdCard {
  const base = ORGANIC_CONTENT[index % ORGANIC_CONTENT.length];
  return { ...base, sampled_at: new Date().toISOString() };
}

export function useRecommend() {
  const userId = getUserId();
  const [current, setCurrent] = useState<AdCard | null>(null);
  const [next, setNext] = useState<AdCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const feedIndex = useRef(0);

  async function getNextCard(): Promise<AdCard> {
    const idx = feedIndex.current++;
    // Every 4th card is an ad attempt; others are organic
    if (idx % 4 === 3) {
      try {
        const card = await fetchAd(userId);
        if (!card.is_organic) return card;
      } catch {
        // fallthrough to organic
      }
    }
    return getOrganicCard(idx);
  }

  const preload = useCallback(async () => {
    try {
      const card = await getNextCard();
      setNext(card);
    } catch (e) {
      console.error("preload failed", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const advance = useCallback(async () => {
    if (next) {
      setCurrent(next);
      setNext(null);
      setStartTime(Date.now());
      void preload();
    } else {
      setLoading(true);
      try {
        const card = await getNextCard();
        setCurrent(card);
        setStartTime(Date.now());
        void preload();
      } finally {
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, userId, preload]);

  useEffect(() => {
    void (async () => {
      try {
        const card = await getNextCard();
        setCurrent(card);
        setStartTime(Date.now());
        if (!card.is_organic) {
          await sendEvent(userId, card.ad_id, "impression", 0, 0);
        }
        void preload();
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const swipe = useCallback(
    async (direction: "up" | "down" | "right") => {
      if (!current) return;
      if (!current.is_organic) {
        const dwellMs = Date.now() - startTime;
        const isQuick = dwellMs < 500;
        let eventType: "complete" | "skip" | "like";
        let completion: number;
        if (direction === "up") {
          eventType = "complete"; completion = 1.0;
        } else if (direction === "right") {
          eventType = "like"; completion = 0.8;
        } else {
          eventType = isQuick ? "skip" : "skip"; completion = 0.0;
        }
        await sendEvent(userId, current.ad_id, eventType, dwellMs, completion);
      }
      await advance();
    },
    [current, startTime, userId, advance]
  );

  const lpClick = useCallback(async () => {
    if (!current || current.is_organic) return;
    const dwellMs = Date.now() - startTime;
    await sendEvent(userId, current.ad_id, "lp_click", dwellMs, 0.8);
    await advance();
  }, [current, startTime, userId, advance]);

  return { current, loading, swipe, lpClick, userId };
}
