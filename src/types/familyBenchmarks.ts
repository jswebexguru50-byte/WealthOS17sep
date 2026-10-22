export interface BenchmarkOption {
  id: string;
  name: string;
  symbol?: string;   // Yahoo Finance symbol (e.g. '^NSEI')
  category: 'Broad Market' | 'Sectoral' | 'Thematic' | 'Asset Allocation' | 'Global';
  description: string;
  annualizedReturn: number;
}

export interface FamilyGroup {
  id: string;
  name: string;
  description: string;
  primaryPan?: string;
  targetBenchmark: string;
  portfolios: string[];
  createdAt: string;
}

export const STANDARD_BENCHMARKS: BenchmarkOption[] = [
  { id: 'NIFTY_50', name: 'Nifty 50 TRI', symbol: '^NSEI', category: 'Broad Market', description: 'Top 50 large-cap bluechip Indian enterprises', annualizedReturn: 14.8 },
  { id: 'NIFTY_500', name: 'Nifty 500 Multicap', symbol: '^NIFTY500', category: 'Broad Market', description: 'Broadest market gauge representing 95% of listed universe', annualizedReturn: 16.2 },
  { id: 'NIFTY_MIDCAP_100', name: 'Nifty Midcap 100', symbol: '^NSEMDCP100', category: 'Broad Market', description: 'High-growth mid-sized Indian companies', annualizedReturn: 22.4 },
  { id: 'NIFTY_SMALLCAP_250', name: 'Nifty Smallcap 250', symbol: '^NIFTY250SMR', category: 'Broad Market', description: 'Emerging small-cap growth leaders', annualizedReturn: 24.1 },
  { id: 'SENSEX', name: 'BSE Sensex 30', symbol: '^BSESN', category: 'Broad Market', description: 'BSE 30 benchmark index', annualizedReturn: 14.2 },
  { id: 'NIFTY_BANK', name: 'Nifty Bank Index', symbol: '^NSEBANK', category: 'Sectoral', description: 'Banking and credit sector leaders', annualizedReturn: 13.9 },
  { id: 'NIFTY_IT', name: 'Nifty IT Index', symbol: '^CNXIT', category: 'Sectoral', description: 'Global tech and IT services exporters', annualizedReturn: 17.5 },
  { id: 'BLENDED_60_40', name: 'Blended 60:40 (Equity : Debt)', symbol: undefined, category: 'Asset Allocation', description: 'Balanced conservative wealth benchmark', annualizedReturn: 11.8 }
];
