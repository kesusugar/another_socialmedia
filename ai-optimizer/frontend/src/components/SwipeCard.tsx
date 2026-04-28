import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import type { AdCard } from "../hooks/useRecommend";

const CATEGORY_COLORS: Record<string, string> = {
  tech:    "from-blue-600 to-indigo-800",
  animal:  "from-green-500 to-emerald-700",
  comedy:  "from-yellow-400 to-orange-600",
  news:    "from-gray-500 to-slate-700",
  sports:  "from-red-500 to-rose-700",
  organic: "from-purple-600 to-pink-700",
};

const CATEGORY_EMOJI: Record<string, string> = {
  tech:    "💻",
  animal:  "🐾",
  comedy:  "😂",
  news:    "📰",
  sports:  "⚽",
  organic: "🎬",
};

interface Props {
  card: AdCard;
  onSwipe: (direction: "up" | "down" | "right") => void;
  onLpClick?: () => void;
}

export function SwipeCard({ card, onSwipe, onLpClick }: Props) {
  const y = useMotionValue(0);
  const x = useMotionValue(0);

  const rotateZ = useTransform(x, [-200, 200], [-15, 15]);
  const overlayOpacity = useTransform(y, [-200, 0, 200], [0.8, 0, 0.8]);
  const likeOpacity = useTransform(x, [0, 150], [0, 1]);
  const skipTextOpacity = useTransform(y, [0, 150], [0, 1]);
  const completeOpacity = useTransform(y, [-150, 0], [1, 0]);

  const gradient = CATEGORY_COLORS[card.category] ?? "from-purple-600 to-pink-700";
  const emoji = CATEGORY_EMOJI[card.category] ?? "🎬";

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    const speedY = Math.abs(velocity.y);
    const speedX = Math.abs(velocity.x);

    if (offset.y < -80 || (speedY > 500 && offset.y < 0)) {
      onSwipe("up");
    } else if (offset.y > 80 || (speedY > 500 && offset.y > 0)) {
      onSwipe("down");
    } else if (offset.x > 80 || (speedX > 500 && offset.x > 0)) {
      onSwipe("right");
    }
  }

  return (
    <motion.div
      className={`absolute inset-4 rounded-3xl bg-gradient-to-br ${gradient}
        flex flex-col items-center justify-center shadow-2xl cursor-grab active:cursor-grabbing`}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      style={{ y, x, rotateZ }}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 0.98 }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {/* Overlay tint */}
      <motion.div
        className="absolute inset-0 rounded-3xl bg-black"
        style={{ opacity: overlayOpacity }}
      />

      {/* 広告バッジ */}
      {!card.is_organic && (
        <div className="absolute top-4 right-4 z-20 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">
          広告
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <span className="text-8xl">{emoji}</span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60 mb-2">
            {card.category}
          </p>
          <h2 className="text-2xl font-bold text-white leading-tight">{card.title}</h2>
        </div>
        {!card.is_organic && (
          <p className="text-xs text-white/40">スコア: {card.score.toFixed(3)}</p>
        )}
      </div>

      {/* LP遷移ボタン（広告のみ） */}
      {!card.is_organic && onLpClick && (
        <button
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 bg-white text-gray-900 text-sm font-bold px-6 py-2 rounded-full shadow-lg hover:bg-gray-100 active:scale-95 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            onLpClick();
          }}
        >
          詳しくはこちら →
        </button>
      )}

      {/* Like overlay */}
      <motion.div
        className="absolute top-6 right-6 border-4 border-green-400 rounded-xl px-4 py-2"
        style={{ opacity: likeOpacity }}
      >
        <span className="text-green-400 font-black text-2xl">LIKE ♥</span>
      </motion.div>

      {/* Skip overlay */}
      <motion.div
        className="absolute top-6 left-6 border-4 border-red-400 rounded-xl px-4 py-2"
        style={{ opacity: skipTextOpacity }}
      >
        <span className="text-red-400 font-black text-2xl">SKIP ✕</span>
      </motion.div>

      {/* Complete overlay */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 border-4 border-blue-400 rounded-xl px-4 py-2"
        style={{ opacity: completeOpacity }}
      >
        <span className="text-blue-400 font-black text-xl">視聴完了 ✓</span>
      </motion.div>

      {/* Swipe hints */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-around text-white/30 text-xs">
        <span>↓ スキップ</span>
        <span>↑ 完了</span>
        <span>→ いいね</span>
      </div>
    </motion.div>
  );
}
