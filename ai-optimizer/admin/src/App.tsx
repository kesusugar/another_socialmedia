import { AlgoPanel } from "./components/AlgoPanel";
import { BudgetPanel } from "./components/BudgetPanel";
import { KpiChart } from "./components/KpiChart";
import { MarketPanel } from "./components/MarketPanel";
import { UserProfile } from "./components/UserProfile";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">
          AI運用最適化シミュレーター — 管理画面 v2.0
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Thompson Sampling + Bayesian Updater + Pacing Engine + tCPA PID制御
        </p>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Row 1: KPI */}
        <KpiChart />

        {/* Row 2: Algo controls + User profile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <AlgoPanel />
          <UserProfile />
        </div>

        {/* Row 3: Budget + Market simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BudgetPanel />
          <MarketPanel />
        </div>
      </main>
    </div>
  );
}
