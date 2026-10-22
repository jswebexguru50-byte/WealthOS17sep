import crypto from 'crypto';
import { DatabaseManager } from './DatabaseManager.js';

export interface CandidateTransaction {
  date: string;
  portfolio: string;
  symbol: string;
  isin?: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAWAL' | 'BONUS' | 'SPLIT' | 'FEE' | string;
  quantity?: number;
  price?: number;
  net_amount?: number;
  brokerage?: number;
  stt?: number;
  order_id?: string;
  trade_id?: string;
  folio_number?: string;
  notes?: string;
}

export interface DuplicateMatch {
  candidate: CandidateTransaction;
  existingId: number;
  existingDate: string;
  existingType: string;
  existingQty: number;
  existingPrice: number;
  existingAmount: number;
  matchType: 'EXACT_ORDER_ID' | 'EXACT_FINGERPRINT' | 'FUZZY_COMPOSITE';
  matchReason: string;
}

export interface DeduplicationAnalysisResult {
  totalCandidates: number;
  uniqueCount: number;
  duplicateCount: number;
  newTransactions: CandidateTransaction[];
  duplicates: DuplicateMatch[];
}

export class TransactionDeduplicationService {
  private static instance: TransactionDeduplicationService;

  private constructor() {}

  public static getInstance(): TransactionDeduplicationService {
    if (!TransactionDeduplicationService.instance) {
      TransactionDeduplicationService.instance = new TransactionDeduplicationService();
    }
    return TransactionDeduplicationService.instance;
  }

  private normalizeType(t?: string): string {
    const s = String(t || '').trim().toUpperCase();
    if (s === 'BUY' || s === 'PURCHASE') return 'BUY';
    if (s === 'SELL' || s === 'SALE') return 'SELL';
    if (s === 'SECURITY IN' || s === 'TRANSFER IN') return 'TRANSFER IN';
    if (s === 'SECURITY OUT' || s === 'TRANSFER OUT') return 'TRANSFER OUT';
    if (s.includes('DIVIDEND')) return 'DIVIDEND';
    if (s.includes('INTEREST')) return 'INTEREST';
    if (s.includes('TDS') || s.includes('TAX DEDUCTED')) return 'TDS';
    if (s.includes('MANAGEMENT') || s.includes('MGMT')) return 'MANAGEMENT_FEE';
    if (s.includes('STT') || s.includes('SEC. TRAN')) return 'STT_EXPENSE';
    if (s.includes('EXPENSE') || s.includes('OPERATING') || s.includes('CHARGES') || s.includes('FEE')) return 'EXPENSE';
    if (s.includes('DEPOSIT') || s.includes('CORPUS') || s.includes('INFLOW')) return 'DEPOSIT';
    if (s.includes('WITHDRAWAL') || s.includes('REDEMPTION') || s.includes('PAYOUT')) return 'WITHDRAWAL';
    return s;
  }

  private normalizeSym(s?: string): string {
    if (!s) return '';
    let str = s.trim().toUpperCase();
    if (str.startsWith('CASH:')) str = str.replace('CASH:', '').trim();
    return str.replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for a transaction
   */
  public generateFingerprint(tx: CandidateTransaction): string {
    const rawSym = this.normalizeSym(tx.symbol || tx.isin || '');
    const rawDate = (tx.date || '').slice(0, 10);
    const rawType = this.normalizeType(tx.type);
    const rawQty = Math.abs(tx.quantity || 0).toFixed(3);
    const rawPrice = (tx.price || 0).toFixed(2);
    const rawAmount = Math.abs(tx.net_amount || (tx.quantity || 0) * (tx.price || 0)).toFixed(2);
    const rawOrder = (tx.order_id || tx.trade_id || '').trim();

    const payload = `${tx.portfolio || ''}|${rawDate}|${rawSym}|${rawType}|${rawQty}|${rawPrice}|${rawAmount}|${rawOrder}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Scans candidate transactions against existing database records to detect duplicates
   */
  public async analyzeDuplicates(
    portfolio: string, 
    candidates: CandidateTransaction[]
  ): Promise<DeduplicationAnalysisResult> {
    const db = DatabaseManager.getInstance();

    // Fetch existing transactions in portfolio
    let query = `
      SELECT id, date, portfolio, symbol, isin, type, quantity, price, net_amount, gross_amount, notes
      FROM Transactions
    `;
    const params: any[] = [];
    if (portfolio && portfolio !== 'Combined' && portfolio !== 'all') {
      query += ` WHERE portfolio = ?`;
      params.push(portfolio);
    }
    query += ` ORDER BY date DESC`;

    const existingRows = await db.query<any>(query, params);

    // Build lookup maps
    const exactOrderMap = new Map<string, any>();
    const existingFingerprintMap = new Map<string, any>();

    existingRows.forEach(row => {
      // Fingerprint existing
      const fp = this.generateFingerprint({
        date: row.date,
        portfolio: row.portfolio,
        symbol: row.symbol,
        isin: row.isin,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        net_amount: row.net_amount
      });
      existingFingerprintMap.set(fp, row);

      // Notes order id lookup if present
      if (row.notes) {
        const orderMatch = row.notes.match(/Order:?\s*([A-Za-z0-9_-]+)/i);
        if (orderMatch && orderMatch[1]) {
          exactOrderMap.set(orderMatch[1].toUpperCase(), row);
        }
      }
    });

    const newTransactions: CandidateTransaction[] = [];
    const duplicates: DuplicateMatch[] = [];
    const seenCandidateFp = new Set<string>();

    for (const cand of candidates) {
      const candFp = this.generateFingerprint(cand);

      // Check intra-batch duplicate (same file repeating a line)
      if (seenCandidateFp.has(candFp)) {
        duplicates.push({
          candidate: cand,
          existingId: -1,
          existingDate: cand.date,
          existingType: cand.type,
          existingQty: cand.quantity || 0,
          existingPrice: cand.price || 0,
          existingAmount: cand.net_amount || (cand.quantity || 0) * (cand.price || 0),
          matchType: 'EXACT_FINGERPRINT',
          matchReason: 'Duplicate row found within the same imported statement.'
        });
        continue;
      }
      seenCandidateFp.add(candFp);

      // 1. Check exact Order ID match
      const orderKey = (cand.order_id || cand.trade_id || '').toUpperCase();
      if (orderKey && exactOrderMap.has(orderKey)) {
        const matched = exactOrderMap.get(orderKey);
        duplicates.push({
          candidate: cand,
          existingId: matched.id,
          existingDate: matched.date,
          existingType: matched.type,
          existingQty: matched.quantity,
          existingPrice: matched.price,
          existingAmount: matched.net_amount,
          matchType: 'EXACT_ORDER_ID',
          matchReason: `Matches existing transaction (ID: ${matched.id}) with Order ID: ${orderKey}`
        });
        continue;
      }

      // 2. Check exact SHA-256 fingerprint
      if (existingFingerprintMap.has(candFp)) {
        const matched = existingFingerprintMap.get(candFp);
        duplicates.push({
          candidate: cand,
          existingId: matched.id,
          existingDate: matched.date,
          existingType: matched.type,
          existingQty: matched.quantity,
          existingPrice: matched.price,
          existingAmount: matched.net_amount,
          matchType: 'EXACT_FINGERPRINT',
          matchReason: `Exact match found on ${matched.date} for ${cand.symbol} (Qty: ${cand.quantity} @ ₹${cand.price})`
        });
        continue;
      }

      // 3. Check fuzzy multi-attribute match
      const candDate = (cand.date || '').slice(0, 10);
      const candSym = this.normalizeSym(cand.symbol || cand.isin || '');
      const candQty = Math.round(Math.abs(cand.quantity || 0) * 1000) / 1000;
      const candType = this.normalizeType(cand.type);
      const candAmt = Math.round(Math.abs(cand.net_amount || (cand.quantity || 0) * (cand.price || 0)) * 100) / 100;

      // 4. Check Sub-Fill vs Aggregate Daily Matching (Contract Note vs Tradebook sub-fills)
      const candGroupKey = `${candDate}|${candSym}|${candType}`;
      const existingSameDayTrades = existingRows.filter(r => {
        const rDate = (r.date || '').slice(0, 10);
        const rSym = this.normalizeSym(r.symbol || r.isin || '');
        const rType = this.normalizeType(r.type);
        return rDate === candDate && (rSym === candSym || (cand.isin && r.isin && r.isin === cand.isin)) && rType === candType;
      });

      if (existingSameDayTrades.length > 0) {
        const totalExistingQty = existingSameDayTrades.reduce((acc, r) => acc + (Math.abs(r.quantity) || 0), 0);
        const totalExistingAmt = existingSameDayTrades.reduce((acc, r) => acc + (Math.abs(r.net_amount) || (Math.abs(r.quantity || 0) * (r.price || 0))), 0);

        // A. Candidate is an aggregate matching the sum of existing sub-fills
        if (existingSameDayTrades.length > 1 && Math.abs(totalExistingQty - candQty) < 0.001) {
          duplicates.push({
            candidate: cand,
            existingId: existingSameDayTrades[0].id,
            existingDate: candDate,
            existingType: candType,
            existingQty: totalExistingQty,
            existingPrice: cand.price || 0,
            existingAmount: totalExistingAmt,
            matchType: 'FUZZY_COMPOSITE',
            matchReason: `Aggregate trade (${candQty} qty) matches sum of ${existingSameDayTrades.length} existing sub-fill trades on ${candDate} for ${cand.symbol}`
          });
          continue;
        }

        // B. Candidate sub-fill matches an existing aggregate trade when candidate batch sum equals aggregate
        const candidateSameDayTrades = candidates.filter(c => {
          const cDate = (c.date || '').slice(0, 10);
          const cSym = this.normalizeSym(c.symbol || c.isin || '');
          const cType = this.normalizeType(c.type);
          return cDate === candDate && (cSym === candSym || (cand.isin && c.isin && c.isin === cand.isin)) && cType === candType;
        });

        if (candidateSameDayTrades.length > 1) {
          const totalCandidateQty = candidateSameDayTrades.reduce((acc, c) => acc + (Math.abs(c.quantity) || 0), 0);
          if (Math.abs(totalCandidateQty - totalExistingQty) < 0.001) {
            duplicates.push({
              candidate: cand,
              existingId: existingSameDayTrades[0].id,
              existingDate: candDate,
              existingType: candType,
              existingQty: totalExistingQty,
              existingPrice: cand.price || 0,
              existingAmount: totalExistingAmt,
              matchType: 'FUZZY_COMPOSITE',
              matchReason: `Sub-fill trade (${candQty} qty) belongs to batch totaling ${totalCandidateQty} qty matching existing trades on ${candDate} for ${cand.symbol}`
            });
            continue;
          }
        }

        // 5. Check Corporate Action Split / Face Value Proportional Duplication (e.g. 10x qty at 0.1x price)
        const splitMatch = existingSameDayTrades.find(r => {
          const rQty = Math.abs(r.quantity || 0);
          const rPrice = r.price || 0;
          const rAmt = Math.abs(r.net_amount || rQty * rPrice);
          const candNetAmt = Math.abs(cand.net_amount || candQty * (cand.price || 0));

          // Monetary amount is identical within 1%
          if (rAmt > 0 && candNetAmt > 0 && Math.abs(rAmt - candNetAmt) / Math.max(rAmt, candNetAmt) < 0.01) {
            // Check ratio 10:1, 5:1, 2:1, 1:10, 1:5, 1:2
            const qtyRatio = candQty > 0 ? rQty / candQty : 0;
            const isSplitRatio = [10, 5, 2, 0.1, 0.2, 0.5].some(ratio => Math.abs(qtyRatio - ratio) < 0.01);
            return isSplitRatio;
          }
          return false;
        });

        if (splitMatch) {
          duplicates.push({
            candidate: cand,
            existingId: splitMatch.id,
            existingDate: splitMatch.date,
            existingType: splitMatch.type,
            existingQty: splitMatch.quantity,
            existingPrice: splitMatch.price,
            existingAmount: splitMatch.net_amount,
            matchType: 'FUZZY_COMPOSITE',
            matchReason: `Split-adjusted duplicate trade detected on ${candDate} for ${cand.symbol} (Identical amount ₹${cand.net_amount || candAmt} with split quantity ratio)`
          });
          continue;
        }
      }

      // If no match found, this is a clean unique transaction
      newTransactions.push(cand);
    }

    return {
      totalCandidates: candidates.length,
      uniqueCount: newTransactions.length,
      duplicateCount: duplicates.length,
      newTransactions,
      duplicates
    };
  }

  /**
   * Commits transactions to DB with deduplication handling
   */
  public async commitDeduplicatedTransactions(
    portfolio: string,
    candidates: CandidateTransaction[],
    strategy: 'SKIP_DUPLICATES' | 'OVERWRITE_EXISTING' | 'FORCE_ALL' = 'SKIP_DUPLICATES'
  ): Promise<{
    success: boolean;
    insertedCount: number;
    skippedCount: number;
    updatedCount: number;
    message: string;
  }> {
    const db = DatabaseManager.getInstance();
    const analysis = await this.analyzeDuplicates(portfolio, candidates);

    let insertedCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;

    // 1. Insert new unique transactions
    for (const tx of analysis.newTransactions) {
      await db.execute(`
        INSERT INTO Transactions (
          date, portfolio, symbol, isin, type, quantity, price, gross_amount, net_amount, brokerage, stt, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tx.date,
        portfolio,
        tx.symbol,
        tx.isin || `IN_${tx.symbol || 'CASH'}`,
        tx.type,
        tx.quantity || 0,
        tx.price || 0,
        (tx.quantity || 0) * (tx.price || 0),
        tx.net_amount || (tx.quantity || 0) * (tx.price || 0),
        tx.brokerage || 0,
        tx.stt || 0,
        tx.notes || (tx.order_id ? `Order: ${tx.order_id}` : null)
      ]);
      insertedCount++;
    }

    // 2. Handle duplicates based on strategy
    if (strategy === 'SKIP_DUPLICATES') {
      skippedCount = analysis.duplicates.length;
    } else if (strategy === 'OVERWRITE_EXISTING') {
      for (const dup of analysis.duplicates) {
        if (dup.existingId > 0) {
          await db.execute(`
            UPDATE Transactions
            SET price = ?, net_amount = ?, brokerage = ?, stt = ?, notes = ?
            WHERE id = ?
          `, [
            dup.candidate.price || 0,
            dup.candidate.net_amount || (dup.candidate.quantity || 0) * (dup.candidate.price || 0),
            dup.candidate.brokerage || 0,
            dup.candidate.stt || 0,
            dup.candidate.notes || `Order: ${dup.candidate.order_id || 'UPDATED'}`,
            dup.existingId
          ]);
          updatedCount++;
        }
      }
    } else if (strategy === 'FORCE_ALL') {
      for (const dup of analysis.duplicates) {
        const tx = dup.candidate;
        await db.execute(`
          INSERT INTO Transactions (
            date, portfolio, symbol, isin, type, quantity, price, gross_amount, net_amount, brokerage, stt, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          tx.date,
          portfolio,
          tx.symbol,
          tx.isin || `IN_${tx.symbol || 'CASH'}`,
          tx.type,
          tx.quantity || 0,
          tx.price || 0,
          (tx.quantity || 0) * (tx.price || 0),
          tx.net_amount || (tx.quantity || 0) * (tx.price || 0),
          tx.brokerage || 0,
          tx.stt || 0,
          tx.notes || (tx.order_id ? `Order: ${tx.order_id}` : null)
        ]);
        insertedCount++;
      }
    }

    return {
      success: true,
      insertedCount,
      skippedCount,
      updatedCount,
      message: `Deduplication complete: ${insertedCount} new transaction(s) inserted, ${skippedCount} duplicate(s) safely skipped, ${updatedCount} updated.`
    };
  }

  /**
   * Deduplicates incoming Corporate Actions against existing database entries
   */
  public async deduplicateCorporateActions(
    actions: Array<{
      symbol: string;
      isin?: string;
      action_type: string;
      record_date: string;
      ex_date?: string;
      dividend_per_share?: number;
      numerator?: number;
      denominator?: number;
      details?: string;
    }>
  ): Promise<{
    uniqueActions: typeof actions;
    duplicateCount: number;
    insertedCount: number;
  }> {
    const db = DatabaseManager.getInstance();
    const existing = await db.query<any>(`
      SELECT id, symbol, isin, action_type, record_date, dividend_per_share, numerator, denominator, applied
      FROM CorporateActions
    `);

    const existingKeySet = new Set<string>();
    existing.forEach(row => {
      const key = `${(row.symbol || row.isin || '').toUpperCase()}|${(row.action_type || '').toUpperCase()}|${(row.record_date || '').slice(0, 10)}`;
      existingKeySet.add(key);
    });

    const uniqueActions: typeof actions = [];
    let duplicateCount = 0;
    let insertedCount = 0;

    for (const act of actions) {
      const actKey = `${(act.symbol || act.isin || '').toUpperCase()}|${(act.action_type || '').toUpperCase()}|${(act.record_date || '').slice(0, 10)}`;
      
      if (existingKeySet.has(actKey)) {
        duplicateCount++;
        continue;
      }

      existingKeySet.add(actKey);
      uniqueActions.push(act);

      await db.execute(`
        INSERT INTO CorporateActions (
          symbol, isin, action_type, record_date, ex_date, dividend_per_share, numerator, denominator, details, applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [
        act.symbol.toUpperCase(),
        act.isin || null,
        act.action_type.toUpperCase(),
        act.record_date,
        act.ex_date || null,
        act.dividend_per_share || 0,
        act.numerator || null,
        act.denominator || null,
        act.details || null
      ]);
      insertedCount++;
    }

    return {
      uniqueActions,
      duplicateCount,
      insertedCount
    };
  }

  /**
   * Deduplicates Bank Book Statement lines (Corpus Inflows, Outflows, Dividends, Fees)
   */
  public async deduplicateBankBookLines(
    portfolio: string,
    bankRecords: Array<{
      date: string;
      type: string;
      narration: string;
      debit?: number;
      credit?: number;
      amount: number;
      mappedType: 'DEPOSIT' | 'WITHDRAWAL' | 'DIVIDEND' | 'EXPENSE' | 'INTEREST' | 'BUY' | 'SELL';
    }>
  ): Promise<{
    insertedCount: number;
    skippedCount: number;
    newRecords: typeof bankRecords;
  }> {
    const candidates: CandidateTransaction[] = bankRecords.map(r => ({
      date: r.date,
      portfolio,
      symbol: (r.mappedType as string) === 'DIVIDEND' ? 'CASH: DIVIDEND' : ((r.mappedType as string) === 'TDS' ? 'CASH: Trf to TDS A/c' : `CASH: ${r.mappedType}`),
      type: r.mappedType,
      quantity: 0,
      price: 0,
      net_amount: Math.abs(r.amount),
      notes: r.narration || r.type
    }));

    const result = await this.commitDeduplicatedTransactions(portfolio, candidates, 'SKIP_DUPLICATES');
    return {
      insertedCount: result.insertedCount,
      skippedCount: result.skippedCount,
      newRecords: bankRecords.slice(0, result.insertedCount)
    };
  }
}
