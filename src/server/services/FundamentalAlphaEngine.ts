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
    // As mock (due to missing SAST table), we simulate based on volume proxies and fallback logic.
    public evaluateS17_PromoterSqueeze(candles: Candle[]): ScanResult {
        if (candles.length < 20) return { isSignal: false };
        // Proxy logic: steady volume accumulation over 10 days without price drops
        const recent = candles.slice(candles.length - 10);
        let upDays = 0;
        let downDays = 0;
        let avgVol = 0;
        recent.forEach(c => {
            if (c.close > c.open) upDays++;
            else downDays++;
            avgVol += c.volume;
        });
        avgVol /= 10;
        const lastVol = candles[candles.length - 1].volume;
        
        if (upDays >= 7 && lastVol > avgVol * 2) {
            return {
                isSignal: true,
                reason: 'S17 Proxy: Sustained accumulation footprint hinting at promoter buying',
                metrics: { upDays, downDays, volMultiplier: lastVol / avgVol }
            };
        }
        return { isSignal: false };
    }
}
