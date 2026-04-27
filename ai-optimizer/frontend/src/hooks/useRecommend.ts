import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export interface AdCard {
  ad_id: string;
  category: string;
  title: string;
  thumbnail: string;
  score: number;
  sampled_at: string;
}

const API = "";

function getUserId(): string {
  let id = localStorage.getItem("user_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("user_id", id);
  }
  return id;
}

async function fetchNext(userId: string): Promise<AdCard> {
  const res = await fetch(`${API}/recommend?user_id=${userId}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json() as Promise<AdCard>;
}

async function sendEvent(
  userId: string,
  adId: string,
  eventType: "complete" | "skip" | "like" | "impression",
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

export function useRecommend() {
  const userId = getUserId();
  const [current, setCurrent] = useState<AdCard | null>(null);
  const [next, setNext] = useState<AdCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());

  const preload = useCallback(async () => {
    try {
      const card = await fetchNext(userId);
      setNext(card);
    } catch (e) {
      console.error("preload failed", e);
    }
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
        const card = await fetchNext(userId);
        setCurrent(card);
        setStartTime(Date.now());
        void preload();
      } finally {
        setLoading(false);
      }
    }
  }, [next, userId, preload]);

  // Boot
  useEffect(() => {
    void (async () => {
      try {
        const card = await fetchNext(userId);
        setCurrent(card);
        setStartTime(Date.now());
        await sendEvent(userId, card.ad_id, "impression", 0, 0);
        void preload();
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, preload]);

  const swipe = useCallback(
    async (direction: "up" | "down" | "right") => {
      if (!current) return;
      const dwellMs = Date.now() - startTime;
      const isQuick = dwellMs < 500;

      let eventType: "complete" | "skip" | "like";
      let completion: number;

      if (direction === "up") {
        eventType = "complete";
        completion = 1.0;
      } else if (direction === "right") {
        eventType = "like";
        completion = 0.8;
      } else {
        eventType = isQuick ? "skip" : "skip";
        completion = 0.0;
      }

      await sendEvent(userId, current.ad_id, eventType, dwellMs, completion);
      await advance();
    },
    [current, startTime, userId, advance]
  );

  return { current, loading, swipe, userId };
}
