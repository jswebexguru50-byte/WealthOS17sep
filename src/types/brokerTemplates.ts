export type BrokerFormatId = 
  | 'ZERODHA' 
  | 'GROWW'
  | 'ANGEL_ONE'
  | 'ICICI_DIRECT'
  | 'KOTAK_SECURITIES'
  | 'MOTILAL_OSWAL'
  | 'UPSTOX'
  | 'SHAREKHAN'
  | 'AXIS_DIRECT'
  | 'DHAN'
  | 'FIVE_PAISA'
  | 'HDFC_SKY' 
  | 'HDFC_SECURITIES' 
  | 'DBFS' 
  | 'COMPLETE_CIRCLE_PMS' 
  | 'IIFL_360_ONE_PMS' 
  | 'CAMS_CAS'
  | 'GENERIC_CSV';

export interface BrokerTemplateInfo {
  id: BrokerFormatId;
  name: string;
  category: 'Discount Broker' | 'Full Service' | 'PMS Asset Manager' | 'Mutual Fund Registrar';
  description: string;
  expectedHeaders: string[];
  downloadGuide: string;
}

export interface ReconHoldingItem {
  symbol: string;
  isin?: string;
  name: string;
  fileQty: number;
  dbQty: number;
  qtyDiff: number;
  filePrice: number;
  dbLtp: number;
  fileValue: number;
  dbValue: number;
  status: 'MATCHED' | 'QTY_MISMATCH' | 'MISSING_IN_DB' | 'MISSING_IN_FILE';
}

export const SUPPORTED_BROKER_TEMPLATES: BrokerTemplateInfo[] = [
  {
    id: 'ZERODHA',
    name: 'Zerodha (Console / Tradebook / Holdings)',
    category: 'Discount Broker',
    description: 'Zerodha tradebook CSV, P&L Excel, and holdings statement from Console.',
    expectedHeaders: ['symbol', 'isin', 'trade_date', 'quantity', 'price'],
    downloadGuide: 'Log in to Zerodha Console > Reports > Tradebook / Holdings > Select Date Range > Download CSV.'
  },
  {
    id: 'GROWW',
    name: 'Groww (Stock Trade History / P&L)',
    category: 'Discount Broker',
    description: 'Groww stock transactions, P&L report, and holding statements.',
    expectedHeaders: ['stock symbol', 'isin', 'date', 'quantity', 'execution price', 'type'],
    downloadGuide: 'Groww Web/App > Profile > Reports > Stocks P&L / Orders Report > Download Excel/CSV.'
  },
  {
    id: 'ANGEL_ONE',
    name: 'Angel One (Trade Summary & Ledger)',
    category: 'Discount Broker',
    description: 'Angel One trade register, holding statement, and capital gains export.',
    expectedHeaders: ['scrip', 'isin', 'trade date', 'buy/sell', 'quantity', 'rate', 'net amount'],
    downloadGuide: 'Angel One Web > Reports > Trade History / Capital Gain > Select FY > Download CSV.'
  },
  {
    id: 'ICICI_DIRECT',
    name: 'ICICI Direct (Equity Portfolio & Tradebook)',
    category: 'Full Service',
    description: 'ICICI Direct trade log, capital gains statement, and equity holdings register.',
    expectedHeaders: ['stock symbol', 'company name', 'transaction date', 'action', 'quantity', 'price'],
    downloadGuide: 'ICICI Direct > Equity > Statements > Trade Book / Capital Gain Statement > Export to Excel.'
  },
  {
    id: 'KOTAK_SECURITIES',
    name: 'Kotak Securities / Kotak Neo',
    category: 'Full Service',
    description: 'Kotak Neo & Classic tradebook, holding statement, and contract note register.',
    expectedHeaders: ['instrument', 'isin', 'trade date', 'type', 'qty', 'avg price', 'value'],
    downloadGuide: 'Kotak Neo Web > Reports & Statements > Tradebook / Holdings > Download CSV.'
  },
  {
    id: 'MOTILAL_OSWAL',
    name: 'Motilal Oswal (MO Investor / Trader)',
    category: 'Full Service',
    description: 'Motilal Oswal trade history, holding ledger, and capital gains statement.',
    expectedHeaders: ['scrip name', 'symbol', 'date', 'buy qty', 'sell qty', 'rate', 'net total'],
    downloadGuide: 'MO Investor Portal > My Reports > Trade Summary / Holding Statement > Export CSV.'
  },
  {
    id: 'UPSTOX',
    name: 'Upstox (Tradebook / Holdings)',
    category: 'Discount Broker',
    description: 'Upstox tradebook CSV, P&L statement, and holdings report.',
    expectedHeaders: ['scrip_name', 'isin', 'trade_date', 'quantity', 'price', 'side'],
    downloadGuide: 'Upstox Account > Reports > Trade Report / Holdings > Download CSV.'
  },
  {
    id: 'SHAREKHAN',
    name: 'Sharekhan (Trade Summary & Holding)',
    category: 'Full Service',
    description: 'Sharekhan equity trade ledger, turnover report, and holding register.',
    expectedHeaders: ['company', 'scrip code', 'trade date', 'buy/sell', 'quantity', 'rate'],
    downloadGuide: 'Sharekhan Portal > Accounts > Reports > Trade Log / Equity Holding > Export to CSV.'
  },
  {
    id: 'AXIS_DIRECT',
    name: 'Axis Direct (Trade Log & Holdings)',
    category: 'Full Service',
    description: 'Axis Direct trade history and portfolio holding statement.',
    expectedHeaders: ['security name', 'symbol', 'date', 'transaction type', 'qty', 'rate', 'net amount'],
    downloadGuide: 'Axis Direct > Reports > Trade History / Capital Gains > Download Excel.'
  },
  {
    id: 'DHAN',
    name: 'Dhan (Tradebook & Ledger)',
    category: 'Discount Broker',
    description: 'Dhan app tradebook CSV and equity holding ledger.',
    expectedHeaders: ['trading symbol', 'isin', 'trade time', 'buy/sell', 'quantity', 'price'],
    downloadGuide: 'Dhan Web > My Profile > Statement & Reports > Trade Book > Download CSV.'
  },
  {
    id: 'FIVE_PAISA',
    name: '5paisa (Tradebook & Holdings)',
    category: 'Discount Broker',
    description: '5paisa trade history and portfolio holding statement.',
    expectedHeaders: ['scripname', 'isin', 'tradedate', 'buyqty', 'sellqty', 'rate'],
    downloadGuide: '5paisa Portal > Reports > Trade Book / Holding Statement > Download CSV.'
  },
  {
    id: 'HDFC_SKY',
    name: 'HDFC Sky (Trades & Portfolio)',
    category: 'Discount Broker',
    description: 'HDFC Sky export covering equity trades, holdings, and contract notes.',
    expectedHeaders: ['symbol', 'isin', 'trade date', 'rate', 'qty'],
    downloadGuide: 'HDFC Sky App > Profile > Reports > Stocks P&L / Trade History > Download CSV.'
  },
  {
    id: 'HDFC_SECURITIES',
    name: 'HDFC Securities (Tradebook & Ledger)',
    category: 'Full Service',
    description: 'HDFC Sec trade summary, capital gains statement, and holding register.',
    expectedHeaders: ['scrip name', 'transaction date', 'quantity', 'rate'],
    downloadGuide: 'HDFC Sec Portal > Portfolio > Equity > Trade History / Capital Gains > Download CSV.'
  },
  {
    id: 'DBFS',
    name: 'DBFS (Trade Log & Contract Notes)',
    category: 'Full Service',
    description: 'Doha Brokerage & Financial Services equity trade ledger.',
    expectedHeaders: ['scrip code', 'scrip name', 'qty', 'avg rate', 'net amount'],
    downloadGuide: 'DBFS Web Portal > Reports > Backoffice Trade Register > Export CSV.'
  },
  {
    id: 'COMPLETE_CIRCLE_PMS',
    name: 'Complete Circle Capital PMS',
    category: 'PMS Asset Manager',
    description: 'Monthly PMS portfolio valuation, cash ledger, and stock inventory statement.',
    expectedHeaders: ['security name', 'isin', 'quantity', 'current value'],
    downloadGuide: 'Complete Circle PMS Portal > Reports > Monthly Valuation & Bank Book > Download CSV.'
  },
  {
    id: 'IIFL_360_ONE_PMS',
    name: '360 ONE (IIFL Wealth) PMS',
    category: 'PMS Asset Manager',
    description: '360 ONE Asset Management quarterly holding report, transactions, and cash register.',
    expectedHeaders: ['asset description', 'quantity', 'acquisition cost', 'market value'],
    downloadGuide: '360 ONE Investor Portal > Reports > Holding Statement / Bank Book > Download CSV.'
  },
  {
    id: 'CAMS_CAS',
    name: 'CAMS & KFintech CAS (Mutual Funds)',
    category: 'Mutual Fund Registrar',
    description: 'Consolidated Account Statement covering all AMCs, folios, and direct/regular mutual fund units.',
    expectedHeaders: ['scheme name', 'folio no', 'units', 'nav', 'amount'],
    downloadGuide: 'CAMSONLINE / MFCentral > Request CAS (Detailed) > Select Date Range > Download PDF/Excel.'
  }
];
