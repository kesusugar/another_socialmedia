import { AgentPanel } from "./components/AgentPanel";
import { AlgoPanel } from "./components/AlgoPanel";
import { BudgetPanel } from "./components/BudgetPanel";
import { KpiChart } from "./components/KpiChart";
import { MarketPanel } from "./components/MarketPanel";
import { MlPanel } from "./components/MlPanel";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { SeasonalityPanel } from "./components/SeasonalityPanel";
import { UserProfile } from "./components/UserProfile";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">
          AI運用最適化シミュレーター — 管理画面 v3.1
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Thompson Sampling + Pacing Engine + tCPA PID制御 + CTR LR / MF / GRU + 季節性 + MD/CCポートフォリオ
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

        {/* Row 4: ML models panel */}
        <MlPanel />

        {/* Row 5: Seasonality + Portfolio simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SeasonalityPanel />
          <PortfolioPanel />
        </div>

        {/* Row 6: Virtual user agents */}
        <AgentPanel />
      </main>
    </div>
  );
}
