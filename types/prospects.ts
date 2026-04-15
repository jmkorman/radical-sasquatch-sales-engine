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
}
