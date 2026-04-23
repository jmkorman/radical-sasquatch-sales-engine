export interface Prospect {
  id: string;
  business_name: string;
  type: string | null;
  address: string | null;
  website: string | null;
  instagram: string | null;
  notes: string | null;
  source: string | null;
  added_to_sheet: boolean;
  created_at: string;
  channel?: string | null;
  status?: ProspectStatus | string | null;
  fit_score?: number | null;
  confidence_score?: number | null;
  fit_reason?: string | null;
  suggested_pitch?: string | null;
  source_url?: string | null;
  research_query?: string | null;
  trigger_type?: string | null;
  trigger_reason?: string | null;
  trigger_date?: string | null;
  last_enriched_at?: string | null;
  duplicate_account_id?: string | null;
  finder_bucket?: string | null;
  rejected_at?: string | null;
}

export type ProspectStatus = "new" | "enriched" | "triggered" | "approved" | "rejected";

export interface ProspectFinderBucket {
  id: string;
  label: string;
  channel: string;
  cadence: string;
  description: string;
  searchQuery: string;
  sourceUrl: string;
}
