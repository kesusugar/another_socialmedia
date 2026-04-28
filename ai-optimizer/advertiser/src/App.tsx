import { BrowserRouter, Route, Routes, Link, useLocation } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewCampaign } from "./pages/NewCampaign";
import { CampaignDetail } from "./pages/CampaignDetail";

function Nav() {
  const loc = useLocation();
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-6">
      <Link to="/" className="text-xl font-bold text-white hover:text-blue-400">
        広告主ポータル
      </Link>
      <span className="text-xs text-gray-500">AI運用最適化シミュレーター</span>
      <div className="ml-auto flex items-center gap-4 text-sm">
        <Link
          to="/"
          className={loc.pathname === "/" ? "text-blue-400" : "text-gray-400 hover:text-white"}
        >
          ダッシュボード
        </Link>
        <Link
          to="/campaigns/new"
          className={
            loc.pathname === "/campaigns/new"
              ? "bg-blue-600 text-white px-3 py-1.5 rounded-lg"
              : "bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg"
          }
        >
          + 新規キャンペーン
        </Link>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <Nav />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campaigns/new" element={<NewCampaign />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
