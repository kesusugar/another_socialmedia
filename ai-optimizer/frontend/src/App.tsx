import { AnimatePresence } from "framer-motion";
import { SwipeCard } from "./components/SwipeCard";
import { useRecommend } from "./hooks/useRecommend";

export default function App() {
  const { current, loading, swipe, lpClick, userId } = useRecommend();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950">
      <div className="relative w-full max-w-sm h-[680px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
          </div>
        )}

        <AnimatePresence mode="wait">
          {current && (
            <SwipeCard key={current.ad_id} card={current} onSwipe={swipe} onLpClick={lpClick} />
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 text-gray-600 text-xs font-mono truncate max-w-xs">
        user: {userId.slice(0, 16)}…
      </p>
    </div>
  );
}
