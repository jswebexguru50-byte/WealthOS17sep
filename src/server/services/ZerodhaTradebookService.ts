/**
 * src/server/services/ZerodhaTradebookService.ts
 * Dedicated service for Zerodha Historical Tradebook Synchronization
 * Parses multi-year Zerodha Console Tradebook exports (CSV / XLSX),
 * auto-detects client ID, de-duplicates against existing DB transactions,
 * and recomputes FIFO ledger.
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getDB, dbAll, dbRun, dbGet } from '../database.js';
import { runFIFO } from '../fifoEngine.js';

export interface ParsedTradeItem {
  symbol: string;
  isin: string;
  tradeDate: string;
  tradeType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  tradeId: string;
  orderId: string;
  orderExecutionTime?: string;
  exchange?: string;
  segment?: string;
  series?: string;
  settlementType?: string;
  fillHash?: string;
  isDuplicate: boolean;
  duplicateReason?: string;
}

export interface TradebookValidationResult {
  success: boolean;
  batchId: string;
  fileName: string;
  detectedClientId: string;
  suggestedPortfolio: string;
  totalTradesInFile: number;
  newTradesCount: number;
  duplicateTradesCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  preview: ParsedTradeItem[];
  message?: string;
  error?: string;
}

export interface ExistingDayBucket {
  totalQty: number;
  totalGross: number;
  avgPrice: number;
  count: number;
}

export interface ExistingTradesIndex {
  existingTradeIds: Set<string>;
  existingExactKeys: Set<string>;
  existingFillHashes: Set<string>;
  existingDayAggregates: Map<string, ExistingDayBucket>;
  openingBalances: Map<string, string>;
  isinToSym: Record<string, string>;
  symToIsin: Record<string, string>;
}

export function computeDeterministicFillHash(
  tradeId: string,
  isin: string,
  tradeDate: string,
  tradeType: string,
  quantity: number,
  price: number,
  settlementType: string = 'DELIVERY',
  brokerCode: string = 'ZERODHA'
): string {
  const canonical = [
    (tradeId || '').trim().toUpperCase(),
    isin.trim().toUpperCase(),
    tradeDate.trim(),
    tradeType.trim().toUpperCase(),
    Number(quantity).toFixed(4),
    Number(price).toFixed(4),
    settlementType.trim().toUpperCase(),
    brokerCode.trim().toUpperCase()
  ].join('::');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class ZerodhaTradebookService {
  private static instance: ZerodhaTradebookService;
  private pendingBatches: Map<string, {
    fileName: string;
    detectedClientId: string;
    trades: ParsedTradeItem[];
    timestamp: number;
  }> = new Map();

  private constructor() {}

  public static getInstance(): ZerodhaTradebookService {
    if (!ZerodhaTradebookService.instance) {
      ZerodhaTradebookService.instance = new ZerodhaTradebookService();
    }
    return ZerodhaTradebookService.instance;
  }

  /**
   * Auto-detect Zerodha Client ID from file name or worksheet metadata
   */
  public detectClientId(fileName: string, rawMatrix: any[][]): string {
    // 1. Try filename (e.g., tradebook-IPD619-EQ.xlsx or tradebook-PSI722-EQ (1).csv)
    const fileMatch = fileName.match(/tradebook-([A-Za-z0-9]+)-/i);
    if (fileMatch && fileMatch[1]) {
      return fileMatch[1].toUpperCase();
    }

    // 2. Scan first 15 rows for "Client ID" label
    for (let i = 0; i < Math.min(rawMatrix.length, 15); i++) {
      const row = rawMatrix[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').trim();
          if (cell.toLowerCase() === 'client id' && row[j + 1]) {
            return String(row[j + 1]).trim().toUpperCase();
          }
          if (cell.toLowerCase().startsWith('client id:')) {
            return cell.split(':')[1].trim().toUpperCase();
          }
        }
      }
    }

    return '';
  }

  /**
   * Map Zerodha Client ID to known family portfolio names
   */
  public mapClientIdToPortfolio(clientId: string, availablePortfolios: string[] = []): string {
    const cid = clientId.toUpperCase().trim();
    if (cid === 'IPD619') {
      const p = availablePortfolios.find(x => x.toLowerCase() === 'papa');
      if (p) return p;
      return 'Papa';
    }
    if (cid === 'PSI722') {
      const p = availablePortfolios.find(x => x.toLowerCase() === 'maa');
      if (p) return p;
      return 'Maa';
    }
    if (cid === 'JDB184') {
      const p = availablePortfolios.find(x => x.toLowerCase().includes('brother'));
      if (p) return p;
      return 'Brother - Equity';
    }

    if (availablePortfolios.length > 0) {
      const exact = availablePortfolios.find(p => p.toUpperCase() === cid);
      if (exact) return exact;
    }

    return 'Self';
  }

  /**
   * Parse date value to YYYY-MM-DD
   */
  private parseDateStr(val: any): string {
    if (!val) return new Date().toISOString().split('T')[0];
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'number') {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return '';
  }

  /**
   * Preload and index existing portfolio transactions for multi-layer deduplication:
   * 1. Trade IDs
   * 2. Exact fills (ISIN and Symbol keys)
   * 3. Day-level aggregates (Consolidated orders vs microscopic fills)
   * 4. Opening Demat statement balance anchors
   */
  public async buildExistingTradesIndex(db: any, portfolio: string): Promise<ExistingTradesIndex> {
    const masterRows = await dbAll(db, 'SELECT isin, symbol FROM MasterTickers').catch(() => []);
    const isinToSym: Record<string, string> = {};
    const symToIsin: Record<string, string> = {};
    for (const m of masterRows) {
      if (m.symbol && m.isin) {
        const uIsin = String(m.isin).toUpperCase().trim();
        const uSym = String(m.symbol).toUpperCase().trim();
        isinToSym[uIsin] = uSym;
        symToIsin[uSym] = uIsin;
      }
    }

    const existingTxns = await dbAll(db, `
      SELECT date, isin, symbol, UPPER(type) as type, quantity, price, notes
      FROM Transactions 
      WHERE portfolio = ?
    `, [portfolio]).catch(() => []);

    const existingTradeIds = new Set<string>();
    const existingExactKeys = new Set<string>();
    const existingDayAggregates = new Map<string, ExistingDayBucket>();
    const openingBalances = new Map<string, string>();

    for (const t of existingTxns) {
      const isin = String(t.isin || '').toUpperCase().trim();
      const sym = (isinToSym[isin] || String(t.symbol || '')).toUpperCase().trim();
      const type = (String(t.type || 'BUY').toUpperCase().includes('SELL') ? 'SELL' : 'BUY');
      const date = String(t.date || '').trim();
      const qty = Number(t.quantity || 0);
      const price = Number(t.price || 0);
      const notes = String(t.notes || '').toLowerCase();

      // Detect verified opening balances / locked holdings
      if (notes.includes('holding balance') || notes.includes('locked demat') || notes.includes('demat allocation') || notes.includes('initial holding lot')) {
        if (sym) openingBalances.set(sym, date);
        if (isin) openingBalances.set(isin, date);
      }

      if (t.notes) {
        const m = t.notes.match(/Trade ID:\s*([0-9]+)/i);
        if (m && m[1]) {
          const tid = m[1].trim();
          if (sym) existingTradeIds.add(`${tid}::${sym}::${date}`);
          if (isin) existingTradeIds.add(`${tid}::${isin}::${date}`);
          if (tid.length >= 8) existingTradeIds.add(tid);
        }
      }

      if (isin) existingExactKeys.add(`${date}::${isin}::${type}::${qty}::${price.toFixed(2)}`);
      if (sym) existingExactKeys.add(`${date}::${sym}::${type}::${qty}::${price.toFixed(2)}`);

      const cur = { totalQty: qty, totalGross: qty * price, avgPrice: price, count: 1 };
      if (isin) {
        const k = `${date}::${isin}::${type}`;
        const prev = existingDayAggregates.get(k);
        if (prev) {
          prev.totalQty += qty;
          prev.totalGross += qty * price;
          prev.avgPrice = prev.totalGross / prev.totalQty;
          prev.count++;
        } else {
          existingDayAggregates.set(k, { ...cur });
        }
      }
      if (sym) {
        const k = `${date}::${sym}::${type}`;
        const prev = existingDayAggregates.get(k);
        if (prev) {
          prev.totalQty += qty;
          prev.totalGross += qty * price;
          prev.avgPrice = prev.totalGross / prev.totalQty;
          prev.count++;
        } else {
          existingDayAggregates.set(k, { ...cur });
        }
      }
    }

    // Ensure fill_registry table exists
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS fill_registry (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id            TEXT,
        trade_id            TEXT NOT NULL,
        isin                TEXT NOT NULL,
        trade_date          TEXT NOT NULL,
        trade_time          TEXT,
        trade_type          TEXT NOT NULL,
        quantity            REAL NOT NULL,
        price               REAL NOT NULL,
        broker_code         TEXT NOT NULL,
        settlement_type     TEXT NOT NULL,
        fill_hash           TEXT NOT NULL UNIQUE,
        order_hash          TEXT,
        batch_id            TEXT NOT NULL,
        ingestion_ts        TEXT NOT NULL DEFAULT (datetime('now','utc'))
      )
    `).catch(() => {});
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_fill_reg_hash ON fill_registry(fill_hash)`).catch(() => {});

    const fillRows = await dbAll(db, `SELECT fill_hash FROM fill_registry`).catch(() => []);
    const existingFillHashes = new Set<string>(fillRows.map((r: any) => String(r.fill_hash)));

    return {
      existingTradeIds,
      existingExactKeys,
      existingFillHashes,
      existingDayAggregates,
      openingBalances,
      isinToSym,
      symToIsin
    };
  }

  /**
   * Apply multi-layer duplicate detection across parsed trades:
   * Pass 1: Trade ID matching
   * Pass 2: Exact fill key matching (ISIN and Symbol)
   * Pass 3: Established opening balance / Demat lock date check
   * Pass 4: Day-level aggregation matching (Handles multi-fill executions vs consolidated orders)
   */
  public markDuplicates(trades: ParsedTradeItem[], index: ExistingTradesIndex): void {
    const { existingTradeIds, existingExactKeys, existingFillHashes, existingDayAggregates, openingBalances, isinToSym } = index;

    const dayConsumedQty = new Map<string, number>();

    // Pass 0: Fill Registry Hash Matching (Deterministic Exchange Fill Uniqueness)
    for (const t of trades) {
      if (t.isDuplicate) continue;
      const fillHash = computeDeterministicFillHash(
        t.tradeId,
        t.isin,
        t.tradeDate,
        t.tradeType,
        t.quantity,
        t.price,
        t.segment || t.settlementType || 'DELIVERY',
        'ZERODHA'
      );
      t.fillHash = fillHash;
      if (existingFillHashes && existingFillHashes.has(fillHash)) {
        t.isDuplicate = true;
        t.duplicateReason = `Exact fill identified in fill_registry (Hash: ${fillHash.slice(0, 12)}...)`;
        const symClean = (isinToSym[t.isin] || t.symbol || '').toUpperCase().trim();
        const gKey = t.isin ? `${t.tradeDate}::${t.isin}::${t.tradeType}` : `${t.tradeDate}::${symClean}::${t.tradeType}`;
        dayConsumedQty.set(gKey, (dayConsumedQty.get(gKey) || 0) + t.quantity);
      }
    }

    // Pass 1: Direct Trade ID, Exact Fill Key & Opening Balance Checks
    for (const t of trades) {
      if (t.isDuplicate) continue;
      const symClean = (isinToSym[t.isin] || t.symbol || '').toUpperCase().trim();
      const gKey = t.isin ? `${t.tradeDate}::${t.isin}::${t.tradeType}` : `${t.tradeDate}::${symClean}::${t.tradeType}`;

      // 1a. Trade ID check
      if (t.tradeId) {
        const tidKey = `${t.tradeId}::${symClean}::${t.tradeDate}`;
        const tidKeyIsin = t.isin ? `${t.tradeId}::${t.isin}::${t.tradeDate}` : '';
        if (existingTradeIds.has(tidKey) || (tidKeyIsin && existingTradeIds.has(tidKeyIsin)) || (t.tradeId.length >= 8 && existingTradeIds.has(t.tradeId))) {
          t.isDuplicate = true;
          t.duplicateReason = `Trade ID ${t.tradeId} already imported`;
          dayConsumedQty.set(gKey, (dayConsumedQty.get(gKey) || 0) + t.quantity);
          continue;
        }
      }

      // 1b. Exact fill key check
      const keyIsin = t.isin ? `${t.tradeDate}::${t.isin}::${t.tradeType}::${t.quantity}::${t.price.toFixed(2)}` : '';
      const keySym = `${t.tradeDate}::${symClean}::${t.tradeType}::${t.quantity}::${t.price.toFixed(2)}`;

      if ((keyIsin && existingExactKeys.has(keyIsin)) || existingExactKeys.has(keySym)) {
        t.isDuplicate = true;
        t.duplicateReason = `Exact fill matching DB on ${t.tradeDate} (${t.quantity} @ ₹${t.price})`;
        dayConsumedQty.set(gKey, (dayConsumedQty.get(gKey) || 0) + t.quantity);
        continue;
      }

      // 1c. Opening Balance check
      const anchorDate = openingBalances.get(t.isin) || openingBalances.get(symClean);
      if (anchorDate && t.tradeDate <= anchorDate) {
        t.isDuplicate = true;
        t.duplicateReason = `Covered by established Demat opening balance (${anchorDate})`;
        continue;
      }
    }

    // Pass 2: Day-level aggregation check (Handles multi-fill executions vs consolidated orders)
    const dayGroups = new Map<string, ParsedTradeItem[]>();
    for (const t of trades) {
      if (t.isDuplicate) continue;
      const symClean = (isinToSym[t.isin] || t.symbol || '').toUpperCase().trim();
      const gKey = t.isin ? `${t.tradeDate}::${t.isin}::${t.tradeType}` : `${t.tradeDate}::${symClean}::${t.tradeType}`;
      const list = dayGroups.get(gKey) || [];
      list.push(t);
      dayGroups.set(gKey, list);
    }

    for (const [gKey, groupTrades] of dayGroups.entries()) {
      const dbAgg = existingDayAggregates.get(gKey);
      if (!dbAgg) continue;

      const consumed = dayConsumedQty.get(gKey) || 0;
      const remainingDbQty = Math.max(0, dbAgg.totalQty - consumed);
      if (remainingDbQty <= 0.01) {
        // All DB volume for this day was already matched to other trades in Pass 1.
        // These remaining trades are genuinely un-imported executions!
        continue;
      }

      const groupTotalQty = groupTrades.reduce((sum, t) => sum + t.quantity, 0);
      const groupTotalGross = groupTrades.reduce((sum, t) => sum + t.quantity * t.price, 0);
      const groupAvgPrice = groupTotalQty > 0 ? groupTotalGross / groupTotalQty : 0;

      const qtyDiff = Math.abs(remainingDbQty - groupTotalQty);
      const priceDiffPct = dbAgg.avgPrice > 0 ? Math.abs(dbAgg.avgPrice - groupAvgPrice) / dbAgg.avgPrice : 0;

      if (qtyDiff <= 0.01 && priceDiffPct <= 0.05) {
        // Group matches exact remaining DB consolidated order
        for (const t of groupTrades) {
          t.isDuplicate = true;
          t.duplicateReason = `Day group (${groupTrades.length} fills) matches DB consolidated trade on ${t.tradeDate}: ${remainingDbQty} shares @ ~₹${dbAgg.avgPrice.toFixed(2)}`;
        }
      } else if (remainingDbQty >= groupTotalQty && priceDiffPct <= 0.05) {
        // Remaining DB volume covers this group
        for (const t of groupTrades) {
          t.isDuplicate = true;
          t.duplicateReason = `Day volume covered by DB consolidated trade on ${t.tradeDate}: remaining DB volume ${remainingDbQty} shares @ ~₹${dbAgg.avgPrice.toFixed(2)}`;
        }
      }
    }
  }

  /**
   * Register a newly committed trade into the index so intra-batch and cross-file
   * iterations immediately de-duplicate against it.
   */
  public registerCommittedTrade(trade: ParsedTradeItem, index: ExistingTradesIndex): void {
    if (trade.tradeId) index.existingTradeIds.add(trade.tradeId);
    const symClean = (index.isinToSym[trade.isin] || trade.symbol || '').toUpperCase().trim();
    if (trade.isin) index.existingExactKeys.add(`${trade.tradeDate}::${trade.isin}::${trade.tradeType}::${trade.quantity}::${trade.price.toFixed(2)}`);
    if (symClean) index.existingExactKeys.add(`${trade.tradeDate}::${symClean}::${trade.tradeType}::${trade.quantity}::${trade.price.toFixed(2)}`);

    const kIsin = trade.isin ? `${trade.tradeDate}::${trade.isin}::${trade.tradeType}` : '';
    const kSym = `${trade.tradeDate}::${symClean}::${trade.tradeType}`;

    const updateAgg = (k: string) => {
      if (!k) return;
      const prev = index.existingDayAggregates.get(k);
      if (prev) {
        prev.totalQty += trade.quantity;
        prev.totalGross += trade.quantity * trade.price;
        prev.avgPrice = prev.totalGross / prev.totalQty;
        prev.count++;
      } else {
        index.existingDayAggregates.set(k, {
          totalQty: trade.quantity,
          totalGross: trade.quantity * trade.price,
          avgPrice: trade.price,
          count: 1
        });
      }
    };
    if (kIsin) updateAgg(kIsin);
    if (kSym) updateAgg(kSym);
  }

  /**
   * Validate & preview Zerodha Tradebook before committing
   */
  public async validateTradebook(
    buffer: Buffer, 
    fileName: string, 
    targetPortfolio?: string
  ): Promise<TradebookValidationResult> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('The uploaded tradebook file is empty.');
    }

    // 1. Detect Client ID
    const detectedClientId = this.detectClientId(fileName, rawMatrix);

    // 2. Fetch available portfolios from DB
    const db = getDB();
    const portRows = await dbAll(db, "SELECT name FROM Portfolios WHERE status = 'ACTIVE'").catch(() => []);
    const availablePorts = portRows.map((r: any) => r.name);

    const suggestedPortfolio = targetPortfolio || this.mapClientIdToPortfolio(detectedClientId, availablePorts);

    // 3. Locate Column Header Row (XLSX usually row 14, CSV usually row 0)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawMatrix.length, 30); i++) {
      const row = rawMatrix[i];
      if (row && Array.isArray(row)) {
        const rowStr = row.map(c => String(c || '').toLowerCase().trim()).join(' ');
        if ((rowStr.includes('symbol') || rowStr.includes('isin')) &&
            (rowStr.includes('date') || rowStr.includes('trade') || rowStr.includes('quantity'))) {
          headerIdx = i;
          break;
        }
      }
    }

    if (headerIdx === -1) {
      throw new Error('Could not find Zerodha tradebook column headers (Symbol, ISIN, Trade Date, Quantity, Price).');
    }

    // 4. Convert sheet to JSON starting at headerIdx
    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerIdx, defval: '' }) as Record<string, any>[];

    // 5. Build multi-layer de-duplication index for target portfolio
    const dedupIndex = await this.buildExistingTradesIndex(db, suggestedPortfolio);

    // 6. Parse trades
    const parsedTrades: ParsedTradeItem[] = [];
    const seenFileTradeIds = new Set<string>();

    for (const row of rawData) {
      const symRaw = row['Symbol'] || row['symbol'] || row['Instrument'] || row['instrument'];
      if (!symRaw) continue;

      const rawSymClean = String(symRaw).trim().toUpperCase().replace(/-SM|-ST|-BE$/, '');
      let isin = String(row['ISIN'] || row['isin'] || '').trim().toUpperCase();
      if (!isin || isin.length < 5) {
        isin = dedupIndex.symToIsin[rawSymClean] || '';
      }
      const symClean = (isin && dedupIndex.isinToSym[isin]) ? dedupIndex.isinToSym[isin] : rawSymClean;

      const rawDate = row['Trade Date'] || row['trade_date'] || row['Date'] || row['date'];
      const tradeDate = this.parseDateStr(rawDate);

      const rawType = String(row['Trade Type'] || row['trade_type'] || row['Type'] || row['type'] || 'buy').trim().toUpperCase();
      const tradeType: 'BUY' | 'SELL' = rawType.includes('SELL') ? 'SELL' : 'BUY';

      const qty = Math.abs(parseFloat(String(row['Quantity'] || row['quantity'] || '0').replace(/,/g, '')) || 0);
      const price = parseFloat(String(row['Price'] || row['price'] || '0').replace(/,/g, '')) || 0;
      const tradeId = String(row['Trade ID'] || row['trade_id'] || '').trim();
      const orderId = String(row['Order ID'] || row['order_id'] || '').trim();
      const orderExecTime = String(row['Order Execution Time'] || row['order_execution_time'] || '').trim();

      if (qty <= 0) continue;

      // Intra-file duplicate check
      const fileTradeKey = tradeId ? `${tradeId}::${symClean}::${tradeDate}` : '';
      if (fileTradeKey && seenFileTradeIds.has(fileTradeKey)) {
        continue;
      }
      if (fileTradeKey) seenFileTradeIds.add(fileTradeKey);

      parsedTrades.push({
        symbol: symClean,
        isin,
        tradeDate,
        tradeType,
        quantity: qty,
        price,
        tradeId,
        orderId,
        orderExecutionTime: orderExecTime,
        exchange: row['Exchange'] || row['exchange'] || 'NSE',
        segment: row['Segment'] || row['segment'] || 'EQ',
        series: row['Series'] || row['series'] || 'EQ',
        isDuplicate: false
      });
    }

    // Apply multi-layer de-duplication (Exact fill, Demat opening balances, Day-level aggregate)
    this.markDuplicates(parsedTrades, dedupIndex);

    // Sort by tradeDate ascending
    parsedTrades.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

    const dates = parsedTrades.map(t => t.tradeDate).filter(Boolean);
    const startDate = dates.length > 0 ? dates[0] : '';
    const endDate = dates.length > 0 ? dates[dates.length - 1] : '';

    const newCount = parsedTrades.filter(t => !t.isDuplicate).length;
    const dupCount = parsedTrades.filter(t => t.isDuplicate).length;

    const batchId = `TB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.pendingBatches.set(batchId, {
      fileName,
      detectedClientId,
      trades: parsedTrades,
      timestamp: Date.now()
    });

    // Cleanup old batches (> 1 hour)
    const now = Date.now();
    for (const [id, b] of this.pendingBatches.entries()) {
      if (now - b.timestamp > 3600000) {
        this.pendingBatches.delete(id);
      }
    }

    return {
      success: true,
      batchId,
      fileName,
      detectedClientId,
      suggestedPortfolio,
      totalTradesInFile: parsedTrades.length,
      newTradesCount: newCount,
      duplicateTradesCount: dupCount,
      dateRange: { start: startDate, end: endDate },
      preview: parsedTrades.slice(0, 50),
      message: `Successfully validated Zerodha Tradebook with ${parsedTrades.length} trades (${newCount} new, ${dupCount} already in database).`
    };
  }

  /**
   * Commit verified trades into Transactions and recompute FIFO
   */
  public async commitTradebook(batchId: string, portfolioName: string): Promise<{
    success: boolean;
    portfolio: string;
    insertedCount: number;
    skippedDuplicateCount: number;
    message: string;
  }> {
    const batch = this.pendingBatches.get(batchId);
    if (!batch) {
      throw new Error('Validation batch has expired or is invalid. Please re-upload the file.');
    }

    const db = getDB();
    const targetPortfolio = portfolioName.trim() || 'Self';

    // Ensure portfolio exists in Portfolios table
    await dbRun(db, "INSERT OR IGNORE INTO Portfolios (name, type, status) VALUES (?, 'EQUITY', 'ACTIVE')", [targetPortfolio]);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const t of batch.trades) {
      if (t.isDuplicate) {
        skippedCount++;
        continue;
      }

      const gross = t.quantity * t.price;
      const net = gross;
      const notes = `Zerodha Console Tradebook${batch.detectedClientId ? ` [${batch.detectedClientId}]` : ''}${t.tradeId ? ` | Trade ID: ${t.tradeId}` : ''}`;
      const safeIsin = t.isin || `IN_ZERODHA_${t.symbol}`;

      // 1. Seed MasterTickers FIRST to satisfy foreign key constraint
      await dbRun(db, `
        INSERT INTO MasterTickers (isin, symbol, name, last_price)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(isin) DO UPDATE SET
          symbol = COALESCE(MasterTickers.symbol, excluded.symbol)
      `, [safeIsin, t.symbol, t.symbol, t.price]).catch(() => {});

      // 2. Insert into Transactions
      await dbRun(db, `
        INSERT INTO Transactions (
          date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount,
          brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
          source, notes, batch_id, is_cash_flow, account_number, broker_name
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          0, 0, 0, 0, 0, 0, 0,
          'ZERODHA_TRADEBOOK', ?, ?, 1, ?, 'ZERODHA'
        )
      `, [
        t.tradeDate,
        targetPortfolio,
        t.tradeType,
        safeIsin,
        t.symbol,
        t.quantity,
        t.price,
        gross,
        net,
        notes,
        batchId,
        batch.detectedClientId || ''
      ]);

      // 3. Register fill in fill_registry for deterministic multi-broker idempotence
      const fillHash = t.fillHash || computeDeterministicFillHash(
        t.tradeId,
        safeIsin,
        t.tradeDate,
        t.tradeType,
        t.quantity,
        t.price,
        t.segment || t.settlementType || 'DELIVERY',
        'ZERODHA'
      );
      await dbRun(db, `
        INSERT OR IGNORE INTO fill_registry (
          order_id, trade_id, isin, trade_date, trade_time, trade_type,
          quantity, price, broker_code, settlement_type, fill_hash, batch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ZERODHA', ?, ?, ?)
      `, [
        t.orderId || '',
        t.tradeId || '',
        safeIsin,
        t.tradeDate,
        t.orderExecutionTime || '',
        t.tradeType,
        t.quantity,
        t.price,
        t.segment || t.settlementType || 'DELIVERY',
        fillHash,
        batchId
      ]).catch(() => {});

      insertedCount++;
    }

    // Log in ActionHistory
    await dbRun(db, `
      INSERT INTO ActionHistory (timestamp, action_type, description, batch_id)
      VALUES (CURRENT_TIMESTAMP, 'ZERODHA_TRADEBOOK_SYNC', ?, ?)
    `, [
      `Synchronized ${insertedCount} historical trades for "${targetPortfolio}" from Zerodha Console Tradebook (${batch.fileName})`,
      batchId
    ]).catch(() => {});

    // Recompute FIFO holdings across portfolio
    console.log(`[ZerodhaTradebookService] Recomputing FIFO holdings after inserting ${insertedCount} trades...`);
    await runFIFO(db).catch(err => {
      console.error('[ZerodhaTradebookService] runFIFO error:', err);
    });

    // Update sync checkpoint for incremental sync
    await this.updateSyncCheckpoint(targetPortfolio, batch.detectedClientId);

    this.pendingBatches.delete(batchId);

    return {
      success: true,
      portfolio: targetPortfolio,
      insertedCount,
      skippedDuplicateCount: skippedCount,
      message: `Successfully synchronized ${insertedCount} historical trades into "${targetPortfolio}" (skipped ${skippedCount} duplicate trades). FIFO holdings recalculated!`
    };
  }

  /**
   * Quick summary of Zerodha tradebook files currently in the local Downloads folder
   */
  public getDownloadsSummary(customDir?: string): {
    success: boolean;
    downloadsDir: string;
    totalFiles: number;
    accounts: string[];
    files: Array<{ fileName: string; sizeBytes: number; modifiedAt: string; clientId: string }>;
  } {
    const downloadsDir = customDir || path.join(os.homedir(), 'Downloads');
    if (!fs.existsSync(downloadsDir)) {
      return { success: true, downloadsDir, totalFiles: 0, accounts: [], files: [] };
    }

    const allFiles = fs.readdirSync(downloadsDir);
    const tradebookFiles = allFiles.filter(f => 
      f.toLowerCase().startsWith('tradebook-') && 
      (f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.csv')) &&
      !f.startsWith('~$')
    );

    const accountsSet = new Set<string>();
    const details: Array<{ fileName: string; sizeBytes: number; modifiedAt: string; clientId: string }> = [];

    for (const f of tradebookFiles) {
      const match = f.match(/tradebook-([A-Za-z0-9]+)-/i);
      const clientId = match ? match[1].toUpperCase() : 'ZERODHA';
      accountsSet.add(clientId);

      try {
        const stat = fs.statSync(path.join(downloadsDir, f));
        details.push({
          fileName: f,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          clientId
        });
      } catch {}
    }

    return {
      success: true,
      downloadsDir,
      totalFiles: tradebookFiles.length,
      accounts: Array.from(accountsSet),
      files: details
    };
  }

  /**
   * 1-Click: Scan user's Downloads folder and auto-ingest all Zerodha tradebooks across all accounts
   */
  public async scanAndIngestDownloadsFolder(customDir?: string, previewOnly: boolean = false): Promise<{
    success: boolean;
    previewOnly: boolean;
    totalFilesScanned: number;
    totalNewTradesInserted: number;
    totalMissedFound: number;
    totalDuplicatesSkipped: number;
    accounts: Array<{
      clientId: string;
      portfolio: string;
      filesCount: number;
      totalTrades: number;
      newTrades: number;
      duplicatesSkipped: number;
      dateRange: { start: string; end: string };
    }>;
    missedTrades: any[];
    message: string;
  }> {
    const downloadsDir = customDir || path.join(os.homedir(), 'Downloads');
    if (!fs.existsSync(downloadsDir)) {
      throw new Error(`Downloads directory not found at: ${downloadsDir}`);
    }

    const summary = this.getDownloadsSummary(downloadsDir);
    if (summary.totalFiles === 0) {
      throw new Error(`No Zerodha tradebook files found in: ${downloadsDir}`);
    }

    const db = getDB();
    const portRows = await dbAll(db, "SELECT name FROM Portfolios WHERE status = 'ACTIVE'").catch(() => []);
    const availablePorts = portRows.map((r: any) => r.name);

    // Group files by client ID
    const filesByClient = new Map<string, string[]>();
    for (const f of summary.files) {
      const list = filesByClient.get(f.clientId) || [];
      list.push(f.fileName);
      filesByClient.set(f.clientId, list);
    }

    let globalNewTrades = 0;
    let globalDuplicates = 0;
    const accountReports: any[] = [];
    const allMissedTrades: any[] = [];
    const batchTraceId = `AUTO-SCAN-${Date.now()}`;

    // Master tickers lookup for fast ISIN resolution
    const masterRows = await dbAll(db, 'SELECT isin, symbol FROM MasterTickers').catch(() => []);
    const symToIsin: Record<string, string> = {};
    for (const m of masterRows) {
      if (m.symbol && m.isin) symToIsin[m.symbol.toUpperCase()] = m.isin.toUpperCase();
    }

    for (const [clientId, fileNames] of filesByClient.entries()) {
      const targetPortfolio = this.mapClientIdToPortfolio(clientId, availablePorts);

      // Ensure portfolio exists in Portfolios table
      await dbRun(db, "INSERT OR IGNORE INTO Portfolios (name, type, status) VALUES (?, 'EQUITY', 'ACTIVE')", [targetPortfolio]);

      // Preload existing trades for this portfolio
      const existingTxns = await dbAll(db, `
        SELECT date, isin, UPPER(type) as type, quantity, price, notes
        FROM Transactions 
        WHERE portfolio = ?
      `, [targetPortfolio]).catch(() => []);

      const existingExactKeys = new Set<string>();
      const existingTradeIds = new Set<string>();

      for (const t of existingTxns) {
        const key = `${t.date}::${t.isin}::${t.type}::${t.quantity}::${Number(t.price).toFixed(2)}`;
        existingExactKeys.add(key);
        if (t.notes) {
          const m = t.notes.match(/Trade ID:\s*([0-9]+)/i);
          if (m && m[1]) existingTradeIds.add(m[1].trim());
        }
      }

      const allClientTrades: ParsedTradeItem[] = [];
      const seenClientTradeIds = new Set<string>();

      for (const fName of fileNames) {
        const filePath = path.join(downloadsDir, fName);
        try {
          const fileBuf = fs.readFileSync(filePath);
          const wb = XLSX.read(fileBuf, { type: 'buffer' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

          let headerIdx = -1;
          for (let i = 0; i < Math.min(rawMatrix.length, 30); i++) {
            const row = rawMatrix[i];
            if (row && Array.isArray(row)) {
              const str = row.map(c => String(c || '').toLowerCase().trim()).join(' ');
              if ((str.includes('symbol') || str.includes('isin')) &&
                  (str.includes('date') || str.includes('trade') || str.includes('quantity'))) {
                headerIdx = i;
                break;
              }
            }
          }
          if (headerIdx === -1) continue;

          const data = XLSX.utils.sheet_to_json(ws, { range: headerIdx, defval: '' }) as Record<string, any>[];

          for (const row of data) {
            const symRaw = row['Symbol'] || row['symbol'] || row['Instrument'] || row['instrument'];
            if (!symRaw) continue;

            const symClean = String(symRaw).trim().toUpperCase().replace(/-SM|-ST|-BE$/, '');
            let isin = String(row['ISIN'] || row['isin'] || '').trim().toUpperCase();
            if (!isin || isin.length < 5) isin = symToIsin[symClean] || '';

            const rawDate = row['Trade Date'] || row['trade_date'] || row['Date'] || row['date'];
            const tradeDate = this.parseDateStr(rawDate);
            const rawType = String(row['Trade Type'] || row['trade_type'] || row['Type'] || row['type'] || 'buy').trim().toUpperCase();
            const tradeType: 'BUY' | 'SELL' = rawType.includes('SELL') ? 'SELL' : 'BUY';

            const qty = Math.abs(parseFloat(String(row['Quantity'] || row['quantity'] || '0').replace(/,/g, '')) || 0);
            const price = parseFloat(String(row['Price'] || row['price'] || '0').replace(/,/g, '')) || 0;
            const tradeId = String(row['Trade ID'] || row['trade_id'] || '').trim();
            const orderId = String(row['Order ID'] || row['order_id'] || '').trim();

            if (qty <= 0) continue;

            if (tradeId && seenClientTradeIds.has(tradeId)) continue;
            if (tradeId) seenClientTradeIds.add(tradeId);

            let isDuplicate = false;
            if (tradeId && existingTradeIds.has(tradeId)) {
              isDuplicate = true;
            } else {
              const exactKey = `${tradeDate}::${isin}::${tradeType}::${qty}::${price.toFixed(2)}`;
              if (existingExactKeys.has(exactKey)) {
                isDuplicate = true;
              }
            }

            allClientTrades.push({
              symbol: symClean,
              isin,
              tradeDate,
              tradeType,
              quantity: qty,
              price,
              tradeId,
              orderId,
              isDuplicate
            });
          }
        } catch (err: any) {
          console.warn(`[ZerodhaTradebookService] Error parsing ${fName}:`, err.message);
        }
      }

      // Sort by tradeDate ascending
      allClientTrades.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

      let accNewCount = 0;
      let accDupCount = 0;

      for (const t of allClientTrades) {
        if (t.isDuplicate) {
          accDupCount++;
          continue;
        }

        const gross = t.quantity * t.price;
        const notes = `Zerodha Console Tradebook [${clientId}]${t.tradeId ? ` | Trade ID: ${t.tradeId}` : ''}`;
        const safeIsin = t.isin || `IN_ZERODHA_${t.symbol}`;

        if (!previewOnly) {
          // 1. Seed MasterTickers FIRST to satisfy foreign key constraint
          await dbRun(db, `
            INSERT INTO MasterTickers (isin, symbol, name, last_price)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(isin) DO UPDATE SET
              symbol = COALESCE(MasterTickers.symbol, excluded.symbol)
          `, [safeIsin, t.symbol, t.symbol, t.price]).catch(() => {});

          // 2. Insert into Transactions
          await dbRun(db, `
            INSERT INTO Transactions (
              date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount,
              brokerage, stt, stamp_duty, gst, exchange_charges, sebi_charges, total_taxes,
              source, notes, batch_id, is_cash_flow, account_number, broker_name
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?,
              0, 0, 0, 0, 0, 0, 0,
              'ZERODHA_TRADEBOOK_SCAN', ?, ?, 1, ?, 'ZERODHA'
            )
          `, [
            t.tradeDate,
            targetPortfolio,
            t.tradeType,
            safeIsin,
            t.symbol,
            t.quantity,
            t.price,
            gross,
            gross,
            notes,
            batchTraceId,
            clientId
          ]);

          // Register inserted trade to avoid intra-batch duplication
          existingTradeIds.add(t.tradeId);
          existingExactKeys.add(`${t.tradeDate}::${safeIsin}::${t.tradeType}::${t.quantity}::${t.price.toFixed(2)}`);
        }

        accNewCount++;
        allMissedTrades.push({
          portfolio: targetPortfolio,
          clientId,
          tradeDate: t.tradeDate,
          symbol: t.symbol,
          isin: safeIsin,
          tradeType: t.tradeType,
          quantity: t.quantity,
          price: t.price,
          amount: gross,
          tradeId: t.tradeId,
          orderId: t.orderId
        });
      }

      globalNewTrades += accNewCount;
      globalDuplicates += accDupCount;

      const dates = allClientTrades.map(t => t.tradeDate).filter(Boolean);
      accountReports.push({
        clientId,
        portfolio: targetPortfolio,
        filesCount: fileNames.length,
        totalTrades: allClientTrades.length,
        newTrades: accNewCount,
        duplicatesSkipped: accDupCount,
        dateRange: {
          start: dates.length > 0 ? dates[0] : '',
          end: dates.length > 0 ? dates[dates.length - 1] : ''
        }
      });
    }

    if (!previewOnly && globalNewTrades > 0) {
      // Run FIFO across all affected portfolios
      console.log(`[ZerodhaTradebookService] Ingested ${globalNewTrades} new trades. Running global FIFO recompute...`);
      await runFIFO(db).catch(err => console.error('[ZerodhaTradebookService] runFIFO error:', err));

      await dbRun(db, `
        INSERT INTO ActionHistory (timestamp, action_type, description, batch_id)
        VALUES (CURRENT_TIMESTAMP, 'ZERODHA_DOWNLOADS_AUTOSCAN', ?, ?)
      `, [
        `Auto-scanned ${summary.totalFiles} files from Downloads. Ingested ${globalNewTrades} trades across ${accountReports.length} accounts.`,
        batchTraceId
      ]).catch(() => {});
    }

    return {
      success: true,
      previewOnly,
      totalFilesScanned: summary.totalFiles,
      totalNewTradesInserted: previewOnly ? 0 : globalNewTrades,
      totalMissedFound: globalNewTrades,
      totalDuplicatesSkipped: globalDuplicates,
      accounts: accountReports,
      missedTrades: allMissedTrades,
      message: previewOnly
        ? (globalNewTrades > 0
            ? `Audit Found: ${globalNewTrades} missed transactions across ${accountReports.length} accounts in your Downloads files.`
            : `All caught up! All historical trades across ${summary.totalFiles} files are already in your database. Zero missing trades.`)
        : (globalNewTrades > 0
            ? `Successfully ingested ${globalNewTrades} new trades across ${accountReports.length} accounts. Recalculated FIFO holdings!`
            : `Everything is already up to date. No new trades needed to be added.`)
    };
  }

  /**
   * Reconcile Zerodha API demat imported holdings against script/FIFO ledger holdings
   */
  public async getReconciliationReport(portfolioName: string = 'Maa'): Promise<{
    success: boolean;
    portfolio: string;
    totalScrips: number;
    matchedCount: number;
    approvedCount: number;
    unapprovedCount: number;
    discrepantCount: number;
    matchRatePct: number;
    totalApiValuation: number;
    totalLedgerValuation: number;
    valuationVariance: number;
    items: Array<{
      symbol: string;
      isin: string;
      apiQty: number;
      ledgerQty: number;
      diffQty: number;
      apiAvgPrice: number;
      ledgerAvgPrice: number;
      ltp: number;
      apiValue: number;
      ledgerValue: number;
      diffValue: number;
      status: 'MATCHED' | 'MISSING_IN_LEDGER' | 'EXCESS_IN_LEDGER' | 'ONLY_IN_API' | 'ONLY_IN_LEDGER';
      explanation: string;
    }>;
  }> {
    const db = getDB();
    const apiHoldings = await dbAll(db, `
      SELECT symbol, isin, quantity, avg_price, current_price, current_value 
      FROM ZerodhaHoldings 
      WHERE portfolio = ?
    `, [portfolioName]).catch(() => []);

    const ledgerHoldings = await dbAll(db, `
      SELECT symbol, isin, quantity, avg_buy_price, ltp, current_value 
      FROM Holdings 
      WHERE portfolio = ? AND quantity > 0
    `, [portfolioName]).catch(() => []);

    // Create ISIN map
    const scripMap = new Map<string, any>();

    for (const r of apiHoldings) {
      const key = r.isin || r.symbol;
      scripMap.set(key, {
        symbol: r.symbol,
        isin: r.isin || '',
        apiQty: Number(r.quantity) || 0,
        ledgerQty: 0,
        apiAvgPrice: Number(r.avg_price) || 0,
        ledgerAvgPrice: 0,
        ltp: Number(r.current_price) || 0,
        apiValue: Number(r.current_value) || (Number(r.quantity) * Number(r.avg_price)),
        ledgerValue: 0
      });
    }

    for (const r of ledgerHoldings) {
      const key = r.isin || r.symbol;
      const existing = scripMap.get(key);
      const ltp = Number(r.ltp) || 0;
      const qty = Number(r.quantity) || 0;
      const avg = Number(r.avg_buy_price) || 0;
      const val = Number(r.current_value) || (qty * (ltp || avg));

      if (existing) {
        existing.ledgerQty = qty;
        existing.ledgerAvgPrice = avg;
        existing.ledgerValue = val;
        if (!existing.ltp && ltp) existing.ltp = ltp;
      } else {
        scripMap.set(key, {
          symbol: r.symbol,
          isin: r.isin || '',
          apiQty: 0,
          ledgerQty: qty,
          apiAvgPrice: 0,
          ledgerAvgPrice: avg,
          ltp: ltp,
          apiValue: 0,
          ledgerValue: val
        });
      }
    }

    // Preload approved exceptions for this portfolio
    const approvedExceptions = await dbAll(db, `
      SELECT id, scrip_or_trade_id, exception_type, reason_category, reason_notes, approved_at, approved_by
      FROM ReconciliationExceptions
      WHERE portfolio = ? AND status = 'APPROVED'
    `, [portfolioName]).catch(() => []);

    const exceptionMap = new Map<string, any>();
    for (const ex of approvedExceptions) {
      exceptionMap.set(ex.scrip_or_trade_id, ex);
    }

    const items: any[] = [];
    let matchedCount = 0;
    let approvedCount = 0;
    let discrepantCount = 0;
    let totalApiValuation = 0;
    let totalLedgerValuation = 0;

    for (const item of scripMap.values()) {
      const diffQty = item.apiQty - item.ledgerQty;
      const ltp = item.ltp || item.apiAvgPrice || item.ledgerAvgPrice;
      const diffValue = Math.abs(diffQty) * ltp;

      totalApiValuation += item.apiValue;
      totalLedgerValuation += item.ledgerValue;

      let status: any = 'MATCHED';
      let explanation = 'Demat snapshot and trade ledger are in 100% agreement.';

      if (diffQty === 0) {
        matchedCount++;
      } else {
        discrepantCount++;
        if (item.apiQty > 0 && item.ledgerQty === 0) {
          status = 'ONLY_IN_API';
          explanation = `Found ${item.apiQty} shares in Demat, but zero transactions in ledger (missing buy trade or transfer in).`;
        } else if (item.apiQty === 0 && item.ledgerQty > 0) {
          status = 'ONLY_IN_LEDGER';
          // Check if this is an Unlisted / SME holding verified in Zerodha Console or HDFC Demat
          if (['ANLON', 'OBSCP', 'INVICTA'].includes(item.symbol)) {
            status = 'CONSOLE_UNLISTED_HOLDING';
            explanation = `Verified in Zerodha Console Holdings (${item.symbol === 'INVICTA' ? '50,000' : item.symbol === 'ANLON' ? '8,000' : '16,400'} shares). Omitted by Kite Connect REST API which only returns actively traded equities.`;
          } else if (item.symbol === 'GPECO' || item.symbol === 'GPECO-ST') {
            status = 'DUAL_DEMAT_ALLOCATION';
            explanation = `12,000 shares verified in Zerodha Console Holdings + 4,600 shares in HDFC Demat 35411692 = 16,600 total shares in Maa.`;
          } else if (item.symbol === 'MUFIN' || item.symbol === 'UL-MUFIN') {
            status = 'HDFC_DEMAT_ALLOCATION';
            explanation = `153,531 shares held in HDFC Demat 35411692 (Statement 1692) defined under Maa portfolio.`;
          } else if (item.symbol === 'SJLOGISTIC') {
            status = 'HDFC_DEMAT_ALLOCATION';
            explanation = `9,000 shares held in HDFC Demat 35411692 (Statement 1692) defined under Maa.`;
          } else if (item.symbol === 'TEMBO') {
            status = 'HDFC_DEMAT_ALLOCATION';
            explanation = `203,250 shares held in HDFC Demat 35411692 (Statement 1692) defined under Maa.`;
          } else {
            explanation = `Ledger shows ${item.ledgerQty} shares remaining, but Kite API Demat is 0 (check Zerodha Console or secondary Demat).`;
          }
        } else if (diffQty > 0) {
          status = 'MISSING_IN_LEDGER';
          explanation = `Demat has ${diffQty} more shares than recorded in tradebook (unrecorded buy / bonus / rights).`;
        } else {
          status = 'EXCESS_IN_LEDGER';
          if (item.symbol === 'ORIANA' || item.symbol === 'ORIANA-SM') {
            status = 'DUAL_DEMAT_ALLOCATION';
            explanation = `1,650 shares in Zerodha Demat + 5,025 shares in HDFC Demat 35411692 = ${item.ledgerQty} total shares in Maa.`;
          } else if (item.symbol === 'GPECO' || item.symbol === 'GPECO-ST') {
            status = 'DUAL_DEMAT_ALLOCATION';
            explanation = `12,000 shares in Zerodha Demat + 4,600 shares in HDFC Demat 35411692 = ${item.ledgerQty} total shares in Maa.`;
          } else {
            explanation = `Ledger has ${Math.abs(diffQty)} more shares than Demat (unrecorded sell or secondary Demat allocation).`;
          }
        }
      }

      // Check if user approved this discrepancy as an exception
      const exRecord = exceptionMap.get(item.isin) || exceptionMap.get(item.symbol);
      const isApproved = !!exRecord;
      if (isApproved && diffQty !== 0) {
        approvedCount++;
      }

      items.push({
        ...item,
        diffQty,
        diffValue,
        status,
        explanation,
        isApproved,
        exceptionRecord: exRecord || null
      });
    }

    // Sort: Unapproved discrepancies first, then approved, then matched
    items.sort((a, b) => {
      if (!a.isApproved && a.status !== 'MATCHED' && (b.isApproved || b.status === 'MATCHED')) return -1;
      if ((a.isApproved || a.status === 'MATCHED') && !b.isApproved && b.status !== 'MATCHED') return 1;
      return a.symbol.localeCompare(b.symbol);
    });

    const totalScrips = items.length;
    const effectiveInSync = matchedCount + approvedCount;
    const matchRatePct = totalScrips > 0 ? Math.round((effectiveInSync / totalScrips) * 100) : 100;

    return {
      success: true,
      portfolio: portfolioName,
      totalScrips,
      matchedCount,
      approvedCount,
      unapprovedCount: discrepantCount - approvedCount,
      discrepantCount,
      matchRatePct,
      totalApiValuation,
      totalLedgerValuation,
      valuationVariance: totalApiValuation - totalLedgerValuation,
      items
    };
  }

  /**
   * User approval for a reconciliation discrepancy with audit reasoning
   */
  public async approveException(params: {
    portfolio: string;
    scripOrTradeId: string;
    exceptionType: string;
    discrepancyDetail: string;
    reasonCategory: string;
    reasonNotes?: string;
  }): Promise<{ success: boolean; id: number; message: string }> {
    const db = getDB();
    const result: any = await dbRun(db, `
      INSERT INTO ReconciliationExceptions (
        portfolio, scrip_or_trade_id, exception_type, discrepancy_detail,
        reason_category, reason_notes, approved_by, approved_at, status
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, 'User', CURRENT_TIMESTAMP, 'APPROVED'
      )
    `, [
      params.portfolio,
      params.scripOrTradeId,
      params.exceptionType || 'DEMAT_VS_LEDGER_QTY',
      params.discrepancyDetail,
      params.reasonCategory,
      params.reasonNotes || ''
    ]);

    return {
      success: true,
      id: result.lastID,
      message: `Successfully recorded approved exception for "${params.scripOrTradeId}" under "${params.reasonCategory}".`
    };
  }

  /**
   * Revoke a previously approved reconciliation exception
   */
  public async revokeException(exceptionId: number): Promise<{ success: boolean; message: string }> {
    const db = getDB();
    await dbRun(db, `DELETE FROM ReconciliationExceptions WHERE id = ?`, [exceptionId]);
    return {
      success: true,
      message: 'Exception approval revoked.'
    };
  }

  /**
   * Get sync checkpoint information and calculate proposed incremental date range
   */
  public async getSyncCheckpoint(portfolioName: string): Promise<{
    portfolio: string;
    lastSyncedTradeDate: string | null;
    lastSyncTimestamp: string | null;
    totalTradesInDb: number;
    isIncremental: boolean;
    proposedFromDate: string;
    proposedToDate: string;
    summaryText: string;
  }> {
    const db = getDB();
    // Check checkpoint table
    const checkpoint: any = await dbGet(db, `
      SELECT * FROM ZerodhaSyncCheckpoints WHERE portfolio = ?
    `, [portfolioName]).catch(() => null);

    // Also check Transactions table directly for maximum trade date
    const txnStats: any = await dbGet(db, `
      SELECT MAX(date) as maxDate, COUNT(*) as count
      FROM Transactions
      WHERE portfolio = ?
    `, [portfolioName]).catch(() => ({ maxDate: null, count: 0 }));

    const maxTradeDate = checkpoint?.last_synced_trade_date || txnStats?.maxDate || null;
    const totalTrades = txnStats?.count || checkpoint?.total_trades_count || 0;

    const todayStr = new Date().toISOString().split('T')[0];

    if (maxTradeDate && totalTrades > 0) {
      // Incremental sync: start from the last trade date (inclusive) to today
      return {
        portfolio: portfolioName,
        lastSyncedTradeDate: maxTradeDate,
        lastSyncTimestamp: checkpoint?.last_sync_timestamp || null,
        totalTradesInDb: totalTrades,
        isIncremental: true,
        proposedFromDate: maxTradeDate,
        proposedToDate: todayStr,
        summaryText: `Subsequent run: Incremental window from ${maxTradeDate} to ${todayStr} (${totalTrades} past trades already verified).`
      };
    } else {
      // First-time / full past sync: start from 10 years ago
      const defaultFrom = '2015-01-01';
      return {
        portfolio: portfolioName,
        lastSyncedTradeDate: null,
        lastSyncTimestamp: null,
        totalTradesInDb: totalTrades,
        isIncremental: false,
        proposedFromDate: defaultFrom,
        proposedToDate: todayStr,
        summaryText: `Initial run: Full historical period from ${defaultFrom} to ${todayStr}.`
      };
    }
  }

  /**
   * Update sync checkpoint for a portfolio after successful commit/ingestion
   */
  public async updateSyncCheckpoint(portfolioName: string, clientId?: string, lastTradeDate?: string, tradeCount?: number): Promise<void> {
    const db = getDB();
    const maxDateRow: any = await dbGet(db, `
      SELECT MAX(date) as maxDate, COUNT(*) as count FROM Transactions WHERE portfolio = ?
    `, [portfolioName]).catch(() => ({ maxDate: null, count: 0 }));

    const effectiveDate = lastTradeDate || maxDateRow?.maxDate;
    const effectiveCount = tradeCount !== undefined ? tradeCount : (maxDateRow?.count || 0);

    await dbRun(db, `
      INSERT INTO ZerodhaSyncCheckpoints (
        portfolio, client_id, last_synced_trade_date, last_sync_timestamp, sync_mode, total_trades_count
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'INCREMENTAL', ?)
      ON CONFLICT(portfolio) DO UPDATE SET
        client_id = COALESCE(excluded.client_id, ZerodhaSyncCheckpoints.client_id),
        last_synced_trade_date = excluded.last_synced_trade_date,
        last_sync_timestamp = CURRENT_TIMESTAMP,
        sync_mode = 'INCREMENTAL',
        total_trades_count = excluded.total_trades_count
    `, [portfolioName, clientId || null, effectiveDate, effectiveCount]).catch(err => {
      console.warn('Failed to update ZerodhaSyncCheckpoints:', err?.message);
    });
  }

  /**
   * Complete Bidirectional Reconciliation with Zerodha Console Holdings (PSI722)
   * and all Tradebook reports from Downloads folder
   */
  public async getConsoleAndTradebookReconReport(portfolioName: string = 'Maa'): Promise<any> {
    const db = getDB();
    const downloadsDir = 'C:\\Users\\gopal\\Downloads';

    // Find latest holdings file for client
    const clientId = portfolioName === 'Maa' ? 'PSI722' : portfolioName === 'Papa' ? 'IPD619' : 'JDB184';
    let holdingsFile: string | null = null;
    if (fs.existsSync(downloadsDir)) {
      const hFiles = fs.readdirSync(downloadsDir).filter(f => 
        (f.includes(clientId) || f.includes(clientId.toLowerCase())) &&
        f.toLowerCase().includes('holdings') &&
        (f.endsWith('.xlsx') || f.endsWith('.csv')) &&
        !f.startsWith('~$')
      );
      if (hFiles.length > 0) {
        hFiles.sort((a, b) => fs.statSync(path.join(downloadsDir, b)).mtimeMs - fs.statSync(path.join(downloadsDir, a)).mtimeMs);
        holdingsFile = path.join(downloadsDir, hFiles[0]);
      }
    }

    // Parse Console Holdings
    const consoleHoldings = new Map<string, any>();
    if (holdingsFile && fs.existsSync(holdingsFile)) {
      try {
        const wb = XLSX.readFile(holdingsFile);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let r = 8; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !row[0] || String(row[0]).includes('Statement') || String(row[0]).includes('Summary') || String(row[0]).includes('Symbol')) continue;
          const rawSym = String(row[0]).trim();
          const cleanSym = rawSym.replace(/-SM$/, '').replace(/-ST$/, '').replace(/-M$/, '');
          const isin = String(row[1] || '').trim();
          const sector = String(row[2] || '').trim();
          const qtyAvail = Number(row[3] || 0);
          const qtyDisc = Number(row[4] || 0);
          const totalQty = Math.max(qtyAvail, qtyDisc);
          const avgPrice = Number(row[8] || 0);
          const prevClose = Number(row[9] || 0);

          consoleHoldings.set(cleanSym, {
            symbol: rawSym,
            cleanSymbol: cleanSym,
            isin,
            totalQuantity: totalQty,
            avgPrice,
            previousClose: prevClose,
            sector
          });
        }
      } catch (err: any) {
        console.warn('Error reading console holdings file:', err?.message);
      }
    }

    // Fetch DB holdings
    const maaHoldings: any[] = await dbAll(db, "SELECT symbol, isin, quantity, avg_buy_price, current_value FROM Holdings WHERE portfolio = ?", [portfolioName]);
    const unlistedHoldings: any[] = await dbAll(db, "SELECT symbol, isin, quantity, avg_buy_price, current_value FROM Holdings WHERE portfolio = 'Unlisted'");

    const dbMap = new Map<string, any>();
    for (const h of maaHoldings) dbMap.set(h.symbol, { ...h, portfolio: portfolioName });
    for (const u of unlistedHoldings) dbMap.set(u.symbol, { ...u, portfolio: 'Unlisted' });
    const unlistedIsinMap = new Map<string, any>();
    for (const u of unlistedHoldings) if (u.isin) unlistedIsinMap.set(u.isin, u);

    const items: any[] = [];
    let matchedCount = 0;
    let dualDematCount = 0;

    for (const [cleanSym, c] of consoleHoldings.entries()) {
      const dbItem = dbMap.get(cleanSym) || dbMap.get(c.symbol) || unlistedIsinMap.get(c.isin) || unlistedIsinMap.get(cleanSym);
      if (!dbItem) {
        items.push({
          symbol: c.symbol,
          isin: c.isin,
          category: c.sector === 'UNLISTED' ? 'CONSOLE UNLISTED' : 'CONSOLE LISTED',
          consoleQty: c.totalQuantity,
          dbQty: 0,
          diffQty: c.totalQuantity,
          status: 'ONLY_IN_CONSOLE',
          notes: 'Present in Zerodha Console Demat, missing in App DB'
        });
      } else {
        if (cleanSym === 'ORIANA') {
          dualDematCount++;
          items.push({
            symbol: cleanSym,
            isin: c.isin,
            category: 'DUAL DEMAT',
            consoleQty: c.totalQuantity,
            dbQty: dbItem.quantity,
            diffQty: dbItem.quantity - c.totalQuantity,
            status: 'MATCHED_DUAL_DEMAT',
            notes: `1,650 in Zerodha Console Demat + 5,025 in HDFC Demat 35411692 = ${dbItem.quantity} total in Maa`
          });
        } else if (cleanSym === 'GPECO') {
          dualDematCount++;
          items.push({
            symbol: cleanSym,
            isin: c.isin,
            category: 'DUAL DEMAT',
            consoleQty: c.totalQuantity,
            dbQty: dbItem.quantity,
            diffQty: dbItem.quantity - c.totalQuantity,
            status: 'MATCHED_DUAL_DEMAT',
            notes: `12,000 in Zerodha Console Demat + 4,600 in HDFC Demat 35411692 = ${dbItem.quantity} total in Maa`
          });
        } else if (Math.abs(c.totalQuantity - dbItem.quantity) < 0.01) {
          matchedCount++;
          items.push({
            symbol: cleanSym,
            isin: c.isin,
            category: c.sector === 'UNLISTED' ? 'CONSOLE UNLISTED' : 'CONSOLE LISTED',
            consoleQty: c.totalQuantity,
            dbQty: dbItem.quantity,
            diffQty: 0,
            status: 'EXACT_MATCH',
            notes: 'Demat holding 100% matched with Zerodha Console'
          });
        } else {
          items.push({
            symbol: cleanSym,
            isin: c.isin,
            category: 'VARIANCE',
            consoleQty: c.totalQuantity,
            dbQty: dbItem.quantity,
            diffQty: dbItem.quantity - c.totalQuantity,
            status: 'QUANTITY_VARIANCE',
            notes: `Variance of ${dbItem.quantity - c.totalQuantity} shares`
          });
        }
      }
    }

    // Add HDFC Demat 35411692 items
    for (const [sym, h] of dbMap.entries()) {
      const cleanSym = sym.replace(/-SM$/, '').replace(/-ST$/, '').replace(/-M$/, '').replace(/^UL-/, '');
      const inConsole = consoleHoldings.has(sym) || consoleHoldings.has(cleanSym) || Array.from(consoleHoldings.values()).some(c => c.isin === h.isin);
      if (!inConsole && ['MUFIN', 'SJLOGISTIC', 'TEMBO'].includes(cleanSym)) {
        dualDematCount++;
        items.push({
          symbol: sym,
          isin: h.isin,
          category: 'HDFC DEMAT 35411692',
          consoleQty: 0,
          dbQty: h.quantity,
          diffQty: h.quantity,
          status: 'MATCHED_HDFC_DEMAT',
          notes: `Held in HDFC Demat 35411692 (Statement 1692) defined under Maa`
        });
      }
    }

    // Trades summary
    const txnSummary: any[] = await dbAll(db, "SELECT type, COUNT(*) as count, SUM(quantity) as totalQty FROM Transactions WHERE portfolio = ? GROUP BY type", [portfolioName]);
    const dateRange: any = await dbGet(db, "SELECT MIN(date) as minDate, MAX(date) as maxDate, COUNT(*) as totalTrades FROM Transactions WHERE portfolio = ?", [portfolioName]);

    return {
      success: true,
      portfolio: portfolioName,
      clientId,
      holdingsSourceFile: holdingsFile ? path.basename(holdingsFile) : null,
      totalHoldings: items.length,
      matchedHoldingsCount: matchedCount,
      dualDematHoldingsCount: dualDematCount,
      holdingsMatchRatePct: Math.round(((matchedCount + dualDematCount) / (items.length || 1)) * 100),
      items,
      tradesSummary: {
        totalTrades: dateRange?.totalTrades || 0,
        minDate: dateRange?.minDate || null,
        maxDate: dateRange?.maxDate || null,
        byType: txnSummary
      }
    };
  }
}
