/**
 * RecentAccumulationEngine.ts
 *
 * Canonical Recent Accumulation / Smart-Money Engine for WealthOS.
 * Analyzes market activity in the window after the latest disclosed ownership period.
 *
 * Core Invariants:
 * 1. High volume is only UNUSUAL_PARTICIPATION, not smart money.
 * 2. Never identify a beneficial buyer from bhavcopy alone.
 * 3. VERIFIED_SMART_MONEY_ACCUMULATION requires both credible named institutional/promoter buyer
 *    AND verified disclosed transaction evidence.
 * 4. Sustained abnormal volume/delivery without named buyer is POSSIBLE_ACCUMULATION, never verified.
 * 5. Ordinary volume or isolated spike without follow-through is NO_CONFIRMATION.
 * 6. Disclosed institutional selling or repeated high-volume down sessions is DISTRIBUTION_WARNING.
 */

import { getDB, dbAll, dbGet } from '../../../database.js';

async function queryAll<T = any>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (!db) return [];
  if (typeof db.all === 'function') {
    return dbAll<T>(db, sql, params);
  }
  if (typeof db.prepare === 'function') {
    return db.prepare(sql).all(...params) as T[];
  }
  return [];
}

async function queryGet<T = any>(db: any, sql: string, params: any[] = []): Promise<T | null> {
  if (!db) return null;
  if (typeof db.get === 'function') {
    return dbGet<T>(db, sql, params);
  }
  if (typeof db.prepare === 'function') {
    return (db.prepare(sql).get(...params) as T) || null;
  }
  return null;
}

import {
  RecentAccumulationPayload,
  SmartMoneyClassification,
  DisclosedTransaction,
  AbnormalVolumeDay,
  BuyerType,
} from '../types/FundamentalExperienceTypes.js';

export class RecentAccumulationEngine {
  private static instance: RecentAccumulationEngine;

  private constructor() {}

  public static getInstance(): RecentAccumulationEngine {
    if (!RecentAccumulationEngine.instance) {
      RecentAccumulationEngine.instance = new RecentAccumulationEngine();
    }
    return RecentAccumulationEngine.instance;
  }

  /**
   * Classifies buyer entity by known regulatory/market categories.
   */
  public classifyBuyerType(clientName: string): BuyerType {
    const upper = (clientName || '').toUpperCase().trim();
    if (!upper) return 'UNKNOWN';

    // Mutual funds
    if (
      upper.includes('MUTUAL FUND') ||
      upper.includes('TRUSTEE') ||
      upper.includes('NIPPON INDIA') ||
      upper.includes('HDFC MF') ||
      upper.includes('ICICI PRUDENTIAL') ||
      upper.includes('SBI MUTUAL') ||
      upper.includes('KOTAK MAHINDRA MF') ||
      upper.includes('ADITYA BIRLA SUN LIFE') ||
      upper.includes('DSP MUTUAL') ||
      upper.includes('UTI MUTUAL') ||
      upper.includes('QUANT MUTUAL') ||
      upper.includes('MIRAE ASSET')
    ) {
      return 'MUTUAL_FUND';
    }

    // Insurance
    if (
      upper.includes('LIFE INSURANCE') ||
      upper.includes('LIC OF INDIA') ||
      upper.includes('GENERAL INSURANCE') ||
      upper.includes('HDFC LIFE') ||
      upper.includes('ICICI PRU LIFE') ||
      upper.includes('SBI LIFE')
    ) {
      return 'INSURANCE';
    }

    // FII / Foreign Portfolio Investors
    if (
      upper.includes('GOVERNMENT PENSION') ||
      upper.includes('VANGUARD') ||
      upper.includes('ISHARES') ||
      upper.includes('NORGES') ||
      upper.includes('MORGAN STANLEY') ||
      upper.includes('GOLDMAN SACHS') ||
      upper.includes('CITIGROUP') ||
      upper.includes('BNP PARIBAS') ||
      upper.includes('SOCIETE GENERALE') ||
      upper.includes('FIDELITY') ||
      upper.includes('FOREIGN') ||
      upper.includes('EMERGING MARKETS FUND')
    ) {
      return 'FII';
    }

    // Other DII / Financial Institutions
    if (
      upper.includes('BANK') ||
      upper.includes('FINANCIAL SERVICES') ||
      upper.includes('IDBI') ||
      upper.includes('IFCI')
    ) {
      return 'DII';
    }

    // Corporate / LLPs / Securities firms
    if (
      upper.includes('PVT LTD') ||
      upper.includes('PRIVATE LIMITED') ||
      upper.includes('LTD') ||
      upper.includes('LIMITED') ||
      upper.includes('LLP') ||
      upper.includes('SECURITIES') ||
      upper.includes('CAPITAL') ||
      upper.includes('TRADING')
    ) {
      return 'CORPORATE';
    }

    // Individual
    return 'INDIVIDUAL';
  }

  /**
   * Main evaluation entry point for a symbol.
   */
  public async evaluate(
    symbol: string,
    overrideDb?: any
  ): Promise<RecentAccumulationPayload> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const db = overrideDb || getDB();

    const emptyResult: RecentAccumulationPayload = {
      classification: 'NO_CONFIRMATION',
      classificationRationale: 'No stored market activity or disclosure records found for analysis window.',
      analysisStartDate: '',
      analysisEndDate: '',
      latestOwnershipDate: '',
      totalSessions: 0,
      upVolumeVsDownVolume: { upVolume: 0, downVolume: 0, ratio: 1.0 },
      cumulativePositivePriceVolume: 0,
      cumulativeNegativePriceVolume: 0,
      abnormalVolumeDays: [],
      deliveryEvidence: { avgDeliveryPct: null, highDeliverySessions: 0, trend: 'DATA_INSUFFICIENT' },
      namedBuyers: [],
      namedSellers: [],
      historicalDisclosedDeals: [],
      evidence: [],
      limitations: ['Stored database records unavailable'],
    };

    if (!db) return emptyResult;

    // 1. Determine latest disclosed ownership period
    let latestOwnershipDate = '';
    let latestDisclosedPeriod = '';
    try {
      // Check HistoricalShareholdingPattern
      const hRow = await queryGet<any>(
        db,
        `SELECT as_of_date, quarter_label FROM HistoricalShareholdingPattern
         WHERE UPPER(symbol) = ?
         ORDER BY as_of_date DESC LIMIT 1`,
        [cleanSym]
      );
      if (hRow && hRow.as_of_date) {
        latestOwnershipDate = hRow.as_of_date;
        latestDisclosedPeriod = hRow.quarter_label || hRow.as_of_date;
      }
    } catch {
      // Table may not have record
    }

    if (!latestOwnershipDate) {
      // Check fundamental_endpoint_snapshots for share-holdings or shareholding
      try {
        const snap = await queryGet<any>(
          db,
          `SELECT response_json, provider, endpoint FROM fundamental_endpoint_snapshots
           WHERE UPPER(symbol) = ? AND endpoint IN ('share-holdings', 'shareholding')
           ORDER BY fetched_at DESC LIMIT 1`,
          [cleanSym]
        );
        if (snap && snap.response_json) {
          const parsed = JSON.parse(snap.response_json);
          if (Array.isArray(parsed.data) && parsed.data[0]?.history?.[0]?.period) {
            const periodStr = parsed.data[0].history[0].period; // e.g. "Jun 2026"
            latestDisclosedPeriod = periodStr;
            // Parse period string to date
            const parts = periodStr.split(' ');
            if (parts.length === 2) {
              const month = parts[0].toLowerCase();
              const year = parts[1];
              if (month.startsWith('jun')) latestOwnershipDate = `${year}-06-30`;
              else if (month.startsWith('mar')) latestOwnershipDate = `${year}-03-31`;
              else if (month.startsWith('sep')) latestOwnershipDate = `${year}-09-30`;
              else if (month.startsWith('dec')) latestOwnershipDate = `${year}-12-31`;
            }
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // If no verified ownership anchor exists, fail closed — do not define synthetic post-shareholding window
    if (!latestOwnershipDate) {
      return {
        ...emptyResult,
        classificationRationale: 'Missing verified ownership anchor; cannot define post-shareholding market analysis window.',
        limitations: ['Missing verified ownership anchor; cannot define post-shareholding market analysis window.'],
      };
    }

    // 2. Set Analysis Start Date = day after latest ownership date
    const d = new Date(latestOwnershipDate);
    d.setDate(d.getDate() + 1);
    const analysisStartDate = d.toISOString().substring(0, 10);

    // 3. Query stored market data (DailyOHLCV / NseBhavcopy)
    let marketRows: any[] = [];
    try {
      marketRows = await queryAll<any>(
        db,
        `SELECT trade_date, open, high, low, close, volume, turnover, delivery_qty, delivery_pct, prev_close
         FROM DailyOHLCV
         WHERE UPPER(symbol) = ? AND trade_date >= ?
         ORDER BY trade_date ASC`,
        [cleanSym, analysisStartDate]
      );
    } catch {
      // Fall back
    }

    if (!marketRows || marketRows.length === 0) {
      try {
        // Fall back to NseBhavcopy — strictly filtered by analysisStartDate and ordered by trade_date ASC
        marketRows = await queryAll<any>(
          db,
          `SELECT trade_date, open, high, low, close, volume, turnover_lacs as turnover, deliv_qty as delivery_qty, deliv_per as delivery_pct, prev_close
           FROM NseBhavcopy
           WHERE UPPER(symbol) = ? AND trade_date >= ?
           ORDER BY trade_date ASC`,
          [cleanSym, analysisStartDate]
        );
      } catch {
        // Non-fatal
      }
    }

    const totalSessions = marketRows.length;
    const latestMarketDate = totalSessions > 0 ? marketRows[totalSessions - 1].trade_date : analysisStartDate;
    const analysisEndDate = latestMarketDate;

    // 4. Calculate Market Metrics: 20D volume, abnormal volume days, up/down volume
    let upVolume = 0;
    let downVolume = 0;
    let cumulativePositivePriceVolume = 0;
    let cumulativeNegativePriceVolume = 0;
    const abnormalVolumeDays: AbnormalVolumeDay[] = [];
    const deliveryPcts: number[] = [];

    // Rolling 20-day volume calculation
    for (let i = 0; i < marketRows.length; i++) {
      const row = marketRows[i];
      const vol = Number(row.volume) || 0;
      const open = Number(row.open) || 0;
      const high = Number(row.high) || open;
      const low = Number(row.low) || open;
      const close = Number(row.close) || open;
      const prevClose = row.prev_close ? Number(row.prev_close) : (i > 0 ? Number(marketRows[i - 1].close) : open);

      const priceChangePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
      const range = high - low;
      const closePositionPct = range > 0 ? (close - low) / range : 0.5;

      if (priceChangePct >= 0) {
        upVolume += vol;
        cumulativePositivePriceVolume += vol;
      } else {
        downVolume += vol;
        cumulativeNegativePriceVolume += vol;
      }

      if (row.delivery_pct !== null && row.delivery_pct !== undefined) {
        deliveryPcts.push(Number(row.delivery_pct));
      }

      // Compute 20D average volume up to this session
      const startIdx = Math.max(0, i - 20);
      const windowVols = marketRows.slice(startIdx, i + 1).map(r => Number(r.volume) || 0);
      const avgVol20D = windowVols.reduce((a, b) => a + b, 0) / windowVols.length;

      const ratio = avgVol20D > 0 ? vol / avgVol20D : 1.0;

      // Flag abnormal volume (>= 1.5x 20D average with significant volume)
      if (ratio >= 1.5 && vol > 500) {
        abnormalVolumeDays.push({
          date: row.trade_date,
          volume: vol,
          avgVolume20D: Math.round(avgVol20D),
          ratio: Number(ratio.toFixed(2)),
          deliveryPct: row.delivery_pct !== null ? Number(row.delivery_pct) : null,
          priceChangePct: Number(priceChangePct.toFixed(2)),
          closePositionPct: Number(closePositionPct.toFixed(2)),
        });
      }
    }

    const volumeRatio = downVolume > 0 ? Number((upVolume / downVolume).toFixed(2)) : (upVolume > 0 ? 99.0 : 1.0);
    const avgDeliveryPct = deliveryPcts.length > 0
      ? Number((deliveryPcts.reduce((a, b) => a + b, 0) / deliveryPcts.length).toFixed(1))
      : null;
    const highDeliverySessions = deliveryPcts.filter(p => p >= 60).length;

    let deliveryTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'DATA_INSUFFICIENT' = 'DATA_INSUFFICIENT';
    if (deliveryPcts.length >= 5) {
      const recent = deliveryPcts.slice(-5);
      const prior = deliveryPcts.slice(0, 5);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
      if (avgRecent - avgPrior > 5) deliveryTrend = 'INCREASING';
      else if (avgPrior - avgRecent > 5) deliveryTrend = 'DECREASING';
      else deliveryTrend = 'STABLE';
    }

    // 5. Query InstitutionalDeals and SAST/insider records
    let dealRows: any[] = [];
    try {
      dealRows = await queryAll<any>(
        db,
        `SELECT id, deal_date, symbol, client_name, deal_type, quantity, trade_price, deal_category, remarks
         FROM InstitutionalDeals
         WHERE UPPER(symbol) = ?
         ORDER BY deal_date DESC`,
        [cleanSym]
      );
    } catch {
      // Table may be empty
    }

    const namedBuyers: DisclosedTransaction[] = [];
    const namedSellers: DisclosedTransaction[] = [];
    const historicalDisclosedDeals: DisclosedTransaction[] = [];

    for (const d of dealRows) {
      const dealDateRaw = String(d.deal_date || '');
      // Format deal date to YYYY-MM-DD
      let dealDateIso = dealDateRaw;
      const parts = dealDateRaw.split('-');
      if (parts.length === 3) {
        const months: Record<string, string> = {
          JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
          JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
        };
        const day = parts[0].padStart(2, '0');
        const mon = months[parts[1].toUpperCase()] || '01';
        const yr = parts[2];
        dealDateIso = `${yr}-${mon}-${day}`;
      }

      const isPostOwnership = dealDateIso >= analysisStartDate;
      const bType = this.classifyBuyerType(d.client_name);
      const isBuy = String(d.deal_type || '').toUpperCase() === 'BUY';
      const qty = Number(d.quantity) || 0;
      const price = Number(d.trade_price) || 0;
      const valueCr = Number(((qty * price) / 10000000).toFixed(2));

      const tx: DisclosedTransaction = {
        date: dealDateIso,
        buyer: isBuy ? d.client_name : '-',
        seller: !isBuy ? d.client_name : '-',
        quantity: qty,
        averagePrice: price,
        transactionValue: valueCr,
        buyerType: bType,
        source: d.deal_category || 'BULK_DEAL',
        evidenceReference: `DEAL_${cleanSym}_${d.id || dealDateIso}`,
      };

      if (isPostOwnership) {
        if (isBuy) namedBuyers.push(tx);
        else namedSellers.push(tx);
      } else {
        historicalDisclosedDeals.push(tx);
      }
    }

    // 6. Classification Decision Tree
    let classification: SmartMoneyClassification = 'NO_CONFIRMATION';
    let rationale = '';

    const hasCredibleNamedBuyer = namedBuyers.some(
      b => b.buyerType === 'MUTUAL_FUND' || b.buyerType === 'FII' || b.buyerType === 'DII' || b.buyerType === 'INSURANCE' || b.buyerType === 'PROMOTER'
    );
    const hasCredibleNamedSeller = namedSellers.some(
      s => s.buyerType === 'MUTUAL_FUND' || s.buyerType === 'FII' || s.buyerType === 'DII' || s.buyerType === 'PROMOTER'
    );

    // Distribution Warning check
    const highVolumeDownDays = abnormalVolumeDays.filter(a => a.priceChangePct < -1.0).length;
    if (hasCredibleNamedSeller || highVolumeDownDays >= 3 || (volumeRatio < 0.6 && totalSessions >= 10)) {
      classification = 'DISTRIBUTION_WARNING';
      rationale = hasCredibleNamedSeller
        ? `Disclosed institutional selling identified in post-ownership period (${namedSellers[0].seller}, ${namedSellers[0].transactionValue} Cr).`
        : `Repeated high-volume downward sessions (${highVolumeDownDays} sessions) indicate distribution pressure.`;
    }
    // Verified Smart Money check (Requires BOTH named buyer AND disclosed transaction)
    else if (hasCredibleNamedBuyer) {
      classification = 'VERIFIED_SMART_MONEY_ACCUMULATION';
      rationale = `Verified disclosed purchase by ${namedBuyers[0].buyerType} (${namedBuyers[0].buyer}) post-${latestDisclosedPeriod} ownership disclosure (${namedBuyers[0].transactionValue} Cr).`;
    }
    // Possible Accumulation check (Volume/delivery accumulation pattern, but buyer UNIDENTIFIED)
    else if (
      (abnormalVolumeDays.filter(a => a.priceChangePct > 0).length >= 2 && volumeRatio >= 1.3) ||
      (highDeliverySessions >= 2 && volumeRatio >= 1.2)
    ) {
      classification = 'POSSIBLE_ACCUMULATION';
      rationale = `Sustained abnormal volume on positive sessions (${abnormalVolumeDays.length} abnormal days, up/down ratio ${volumeRatio}x) with positive price trend. Beneficial buyer remains unidentified from exchange disclosures.`;
    }
    // No confirmation (default)
    else {
      classification = 'NO_CONFIRMATION';
      rationale = totalSessions === 0
        ? 'No stored trading sessions available after latest ownership disclosure.'
        : `Ordinary market participation post-${latestDisclosedPeriod}. No persistent volume accumulation or disclosed institutional block/bulk deals.`;
    }

    const evidence: string[] = [
      `Analysis Window: ${analysisStartDate} to ${analysisEndDate} (${totalSessions} sessions post-${latestDisclosedPeriod})`,
      `Volume Profile: Up-volume ${Math.round(upVolume).toLocaleString()} vs Down-volume ${Math.round(downVolume).toLocaleString()} (Ratio: ${volumeRatio}x)`,
      `Abnormal Volume Sessions: ${abnormalVolumeDays.length} sessions detected`,
    ];
    if (avgDeliveryPct !== null) {
      evidence.push(`Delivery Profile: Average delivery ${avgDeliveryPct}%, high delivery sessions (>=60%): ${highDeliverySessions}`);
    }
    if (namedBuyers.length > 0) {
      evidence.push(`Disclosed Post-Ownership Buyers: ${namedBuyers.map(b => `${b.buyer} (${b.buyerType})`).join(', ')}`);
    }
    if (namedSellers.length > 0) {
      evidence.push(`Disclosed Post-Ownership Sellers: ${namedSellers.map(s => `${s.seller} (${s.buyerType})`).join(', ')}`);
    }

    const limitations: string[] = [
      'High volume is only unusual market participation; beneficial buyer identity cannot be asserted from bhavcopy alone.',
      'Disclosed bulk/block deals represent trades >= 0.5% of equity; smaller institutional accumulation requires statutory quarterly shareholding updates.',
    ];
    if (deliveryPcts.length === 0) {
      limitations.push('Delivery data unavailable in stored session records; volume evaluation based on gross turnover.');
    }

    return {
      classification,
      classificationRationale: rationale,
      analysisStartDate,
      analysisEndDate,
      latestOwnershipDate,
      totalSessions,
      upVolumeVsDownVolume: {
        upVolume,
        downVolume,
        ratio: volumeRatio,
      },
      cumulativePositivePriceVolume,
      cumulativeNegativePriceVolume,
      abnormalVolumeDays,
      deliveryEvidence: {
        avgDeliveryPct,
        highDeliverySessions,
        trend: deliveryTrend,
      },
      namedBuyers,
      namedSellers,
      historicalDisclosedDeals,
      evidence,
      limitations,
    };
  }
}
