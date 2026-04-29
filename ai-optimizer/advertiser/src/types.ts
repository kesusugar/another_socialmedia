export interface Campaign {
  campaign_id: string;
  name: string;
  category: string;
  daily_budget: number;
  bid_strategy: string;
  target_cpa: number;
  status: string;
  created_at: string;
  ad_count?: number;
  spent_today?: number;
  total_impressions?: number;
  overall_ctr?: number;
  overall_cpa_yen?: number;
}

export interface Ad {
  ad_id: string;
  campaign_id: string;
  title: string;
  category: string;
  thumbnail: string;
  virtual_bid: number;
  cold_start: number;
  vector_json: string;
  created_at: string;
}

export interface KpiPoint {
  minute: string;
  impressions: number;
  ctr: number;
  cvr: number;
  cpa_yen: number;
}

export interface CampaignKpi {
  timeline: KpiPoint[];
  minutes: number;
  total_impressions: number;
  total_lp_clicks: number;
  total_conversions: number;
  overall_ctr: number;
  overall_cvr: number;
  overall_cpa_yen: number;
}

export interface AdKpi {
  ad_id: string;
  minutes: number;
  impressions: number;
  conversions: number;
  ctr: number;
  ecvr: number;
  cpa: number;
  avg_dwell_ms: number;
}

export interface CpaSimResult {
  estimated_cpa: number;
  estimated_ctr: number;
  estimated_ecvr: number;
  target_cpa: number;
  gap: number;
  feasible: boolean;
  competition_level: number;
  note: string;
}

export const CATEGORIES = ["tech", "animal", "comedy", "news", "sports"] as const;
export type Category = typeof CATEGORIES[number];

export const STRATEGY_LABELS: Record<string, string> = {
  manual: "手動入札",
  tcpa: "目標CPA (tCPA)",
  max_delivery: "最大配信",
};

export const CAT_COLORS: Record<string, string> = {
  tech: "text-blue-400",
  animal: "text-green-400",
  comedy: "text-yellow-400",
  news: "text-purple-400",
  sports: "text-orange-400",
};
