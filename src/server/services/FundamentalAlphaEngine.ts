import { Candle } from './PureTechnicalStrategiesEngine.js';
import { getDB, dbAll } from '../database.js';

export interface ScanResult {
    isSignal: boolean;
    reason?: string;
    metrics?: any;
}

export class FundamentalAlphaEngine {
    
    // Strategy S16: Operating Leverage Inflection
    // High fixed-cost enterprise crossing breakeven where +15% revenue triggers > +45% EBITDA.
    public async evaluateS16_OperatingLeverage(symbol: string): Promise<ScanResult> {
        try {
            const db = getDB();
            // We use the QuarterlyEarningsIntelligence table if available
            const rows = await dbAll(db, `
                SELECT revenue_actual, revenue_estimate, ebitda_margin_actual
                FROM QuarterlyEarningsIntelligence
                WHERE symbol = ?
                ORDER BY filing_date DESC LIMIT 2
            `, [symbol]);

            if (rows && rows.length >= 2) {
                const current = rows[0];
                const prev = rows[1];
                if (current.revenue_actual && prev.revenue_actual && current.ebitda_margin_actual && prev.ebitda_margin_actual) {
                    const revGrowth = (current.revenue_actual - prev.revenue_actual) / prev.revenue_actual;
                    const ebitdaGrowth = (current.ebitda_margin_actual - prev.ebitda_margin_actual) / Math.abs(prev.ebitda_margin_actual);
                    
                    if (revGrowth >= 0.15 && ebitdaGrowth >= 0.45) {
                        return {
                            isSignal: true,
                            reason: `S16 Inflection: Rev +${(revGrowth*100).toFixed(1)}%, EBITDA +${(ebitdaGrowth*100).toFixed(1)}%`,
                            metrics: { revGrowth, ebitdaGrowth }
                        };
                    }
                }
            }
            return { isSignal: false };
        } catch (e) {
            return { isSignal: false };
        }
    }

    // Strategy S17: Promoter SAST Creeping Squeeze
    // Promoters acquiring > 2% stake via open-market purchases with zero share pledging.
    // Zero-Fabrication Mandate: Volume accumulation proxy is disabled on production customer paths.
    /**
     * @deprecated RESEARCH_FIXTURE_ONLY - Not authorized for production customer paths.
     */
    public evaluateS17_PromoterSqueeze(candles: Candle[]): ScanResult {
        return {
            isSignal: false,
            reason: 'DATA_INSUFFICIENT: Requires verified SAST regulatory filing table. Volume proxy disabled on production paths.'
        };
    }
}
