export interface ScripMappingRecord {
  id?: string;
  source_broker: string;
  raw_scrip_name: string;
  symbol: string;
  isin: string;
  asset_class?: string;
  sector?: string;
  created_at?: string;
  updated_at?: string;
}
