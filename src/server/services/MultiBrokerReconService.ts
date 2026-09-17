import * as XLSX from 'xlsx';
import { DatabaseManager } from './DatabaseManager.js';
import { AssetScripMappingService } from './AssetScripMappingService.js';

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

export class MultiBrokerReconService {
  private static instance: MultiBrokerReconService;

  private constructor() {}

  public static getInstance(): MultiBrokerReconService {
    if (!MultiBrokerReconService.instance) {
      MultiBrokerReconService.instance = new MultiBrokerReconService();
    }
    return MultiBrokerReconService.instance;
  }

  /**
   * Auto-detect statement format based on headers
   */
  public detectBrokerFormat(headerLine: string): BrokerFormatId {
    const lower = headerLine.toLowerCase();
    if (lower.includes('complete circle') || (lower.includes('security name') && lower.includes('weightage'))) {
      return 'COMPLETE_CIRCLE_PMS';
    }
    if (lower.includes('360 one') || lower.includes('iifl') || lower.includes('acquisition cost')) {
      return 'IIFL_360_ONE_PMS';
    }
    if (lower.includes('groww')) {
      return 'GROWW';
    }
    if (lower.includes('angel') || lower.includes('angelone')) {
      return 'ANGEL_ONE';
    }
    if (lower.includes('icici') || lower.includes('direct')) {
      return 'ICICI_DIRECT';
    }
    if (lower.includes('kotak') || lower.includes('neo')) {
      return 'KOTAK_SECURITIES';
    }
    if (lower.includes('motilal') || lower.includes('mosl') || lower.includes('mow')) {
      return 'MOTILAL_OSWAL';
    }
    if (lower.includes('upstox') || lower.includes('rksv')) {
      return 'UPSTOX';
    }
    if (lower.includes('sharekhan')) {
      return 'SHAREKHAN';
    }
    if (lower.includes('axis')) {
      return 'AXIS_DIRECT';
    }
    if (lower.includes('dhan')) {
      return 'DHAN';
    }
    if (lower.includes('5paisa')) {
      return 'FIVE_PAISA';
    }
    if (lower.includes('zerodha') || (lower.includes('trade_id') && lower.includes('order_id'))) {
      return 'ZERODHA';
    }
    if (lower.includes('hdfc sky') || lower.includes('sky')) {
      return 'HDFC_SKY';
    }
    if (lower.includes('hdfc sec') || lower.includes('security description')) {
      return 'HDFC_SECURITIES';
    }
    if (lower.includes('dbfs') || lower.includes('doha brokerage')) {
      return 'DBFS';
    }
    if (lower.includes('folio no') || lower.includes('cams') || lower.includes('kfintech')) {
      return 'CAMS_CAS';
    }
    return 'GENERIC_CSV';
  }


  /**
   * Parse uploaded file buffer (CSV/Excel) and reconcile against target portfolio in DB
   */
  public async reconcileFileBuffer(
    buffer: Buffer, 
    fileName: string, 
    portfolio: string, 
    forcedFormat?: BrokerFormatId
  ): Promise<{
    success: boolean;
    detectedFormat: BrokerFormatId;
    portfolio: string;
    totalFileRows: number;
    summary: {
      matchedCount: number;
      qtyMismatchCount: number;
      missingInDbCount: number;
      missingInFileCount: number;
      totalFileValuation: number;
      totalDbValuation: number;
    };
    items: ReconHoldingItem[];
  }> {
    const db = DatabaseManager.getInstance();
    const mappingService = AssetScripMappingService.getInstance();

    // 1. Read workbook or CSV buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawRows.length === 0) {
      throw new Error('Uploaded file is empty.');
    }

    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const row = rawRows[i];
      if (Array.isArray(row) && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('symbol') || cell.toLowerCase().includes('scrip') || cell.toLowerCase().includes('isin') || cell.toLowerCase().includes('security')))) {
        headerIdx = i;
        break;
      }
    }

    const headerRow: string[] = (rawRows[headerIdx] || []).map((c: any) => String(c || '').trim());
    const detectedFormat = forcedFormat || this.detectBrokerFormat(headerRow.join(','));

    // Map column indices
    const colIndex: Record<string, number> = {};
    headerRow.forEach((col, idx) => {
      colIndex[col.toLowerCase()] = idx;
    });

    const parsedFileHoldings: Map<string, { name: string; isin: string; qty: number; price: number; value: number }> = new Map();

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      let rawScrip = '';
      let rawIsin = '';
      let qty = 0;
      let price = 0;
      let value = 0;

      // Extract columns based on detected format
      for (const [key, idx] of Object.entries(colIndex)) {
        const cellVal = row[idx];
        if (key.includes('symbol') || key.includes('scrip') || key.includes('security') || key.includes('scheme') || key.includes('asset')) {
          if (!rawScrip && cellVal) rawScrip = String(cellVal).trim();
        }
        if (key.includes('isin')) {
          if (cellVal) rawIsin = String(cellVal).trim().toUpperCase();
        }
        if (key.includes('qty') || key.includes('quantity') || key.includes('units') || key.includes('balance')) {
          const num = parseFloat(String(cellVal).replace(/[^0-9.-]/g, ''));
          if (!isNaN(num) && num > 0) qty = num;
        }
        if (key.includes('price') || key.includes('rate') || key.includes('nav') || key.includes('cost') || key.includes('ltp')) {
          const num = parseFloat(String(cellVal).replace(/[^0-9.-]/g, ''));
          if (!isNaN(num) && num > 0) price = num;
        }
        if (key.includes('value') || key.includes('amount') || key.includes('total')) {
          const num = parseFloat(String(cellVal).replace(/[^0-9.-]/g, ''));
          if (!isNaN(num) && num > 0) value = num;
        }
      }

      if (!rawScrip && !rawIsin) continue;
      if (qty <= 0 && value <= 0) continue;

      // Normalize through mapping service
      const resolved = await mappingService.resolveScrip(detectedFormat, rawScrip || rawIsin);
      const symbolKey = (resolved.symbol || rawScrip || rawIsin).toUpperCase();

      if (value <= 0 && price > 0 && qty > 0) {
        value = price * qty;
      }

      if (parsedFileHoldings.has(symbolKey)) {
        const existing = parsedFileHoldings.get(symbolKey)!;
        existing.qty += qty;
        existing.value += value;
      } else {
        parsedFileHoldings.set(symbolKey, {
          name: rawScrip || symbolKey,
          isin: rawIsin || resolved.isin || '',
          qty,
          price,
          value
        });
      }
    }

    // 2. Fetch target portfolio holdings from SQLite DB
    let dbQuery = `SELECT * FROM Holdings WHERE quantity > 0`;
    const dbParams: any[] = [];
    if (portfolio && portfolio !== 'Combined') {
      dbQuery += ` AND portfolio = ?`;
      dbParams.push(portfolio);
    }
    const dbHoldings = await db.query<any>(dbQuery, dbParams);
    const dbHoldingMap: Map<string, any> = new Map();
    dbHoldings.forEach(h => {
      dbHoldingMap.set(h.symbol.toUpperCase(), h);
    });

    // 3. Perform reconciliation diff
    const items: ReconHoldingItem[] = [];
    let matchedCount = 0;
    let qtyMismatchCount = 0;
    let missingInDbCount = 0;
    let missingInFileCount = 0;
    let totalFileValuation = 0;
    let totalDbValuation = 0;

    // Compare File against DB
    parsedFileHoldings.forEach((fileItem, sym) => {
      totalFileValuation += fileItem.value;
      const dbItem = dbHoldingMap.get(sym);

      if (dbItem) {
        totalDbValuation += (dbItem.current_value || 0);
        const qtyDiff = fileItem.qty - dbItem.quantity;
        const isMatched = Math.abs(qtyDiff) < 0.001;

        if (isMatched) {
          matchedCount++;
        } else {
          qtyMismatchCount++;
        }

        items.push({
          symbol: sym,
          isin: fileItem.isin || dbItem.isin,
          name: fileItem.name || dbItem.symbol,
          fileQty: fileItem.qty,
          dbQty: dbItem.quantity,
          qtyDiff,
          filePrice: fileItem.price || (fileItem.value / (fileItem.qty || 1)),
          dbLtp: dbItem.ltp || 0,
          fileValue: fileItem.value,
          dbValue: dbItem.current_value || 0,
          status: isMatched ? 'MATCHED' : 'QTY_MISMATCH'
        });

        dbHoldingMap.delete(sym); // Processed
      } else {
        missingInDbCount++;
        items.push({
          symbol: sym,
          isin: fileItem.isin,
          name: fileItem.name,
          fileQty: fileItem.qty,
          dbQty: 0,
          qtyDiff: fileItem.qty,
          filePrice: fileItem.price,
          dbLtp: 0,
          fileValue: fileItem.value,
          dbValue: 0,
          status: 'MISSING_IN_DB'
        });
      }
    });

    // Any remaining items in DB not present in file
    dbHoldingMap.forEach((dbItem, sym) => {
      totalDbValuation += (dbItem.current_value || 0);
      missingInFileCount++;
      items.push({
        symbol: sym,
        isin: dbItem.isin,
        name: dbItem.symbol,
        fileQty: 0,
        dbQty: dbItem.quantity,
        qtyDiff: -dbItem.quantity,
        filePrice: 0,
        dbLtp: dbItem.ltp || 0,
        fileValue: 0,
        dbValue: dbItem.current_value || 0,
        status: 'MISSING_IN_FILE'
      });
    });

    return {
      success: true,
      detectedFormat,
      portfolio,
      totalFileRows: parsedFileHoldings.size,
      summary: {
        matchedCount,
        qtyMismatchCount,
        missingInDbCount,
        missingInFileCount,
        totalFileValuation,
        totalDbValuation
      },
      items: items.sort((a, b) => b.fileValue - a.fileValue)
    };
  }
}
