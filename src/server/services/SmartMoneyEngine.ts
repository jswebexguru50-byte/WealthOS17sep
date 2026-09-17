import { Candle } from './PureTechnicalStrategiesEngine.js';

export interface ScanResult {
    isSignal: boolean;
    reason?: string;
    metrics?: any;
}

export class SmartMoneyEngine {
    
    // Strategy S18: Institutional Block Accumulation
    // Pure institutional block deals at CMP or premium with 100% delivery settlement footprint.
    // Proxy logic: Isolates pure institutional block absorption by finding candles with 
    // Volume > 10x the 20-day average and price closing in top 20% of the range.
    public evaluateS18_BlockAccumulation(candles: Candle[]): ScanResult {
        if (candles.length < 21) return { isSignal: false };
        
        const recent = candles.slice(candles.length - 21, candles.length - 1);
        const avgVol = recent.reduce((sum, c) => sum + c.volume, 0) / 20;
        const last = candles[candles.length - 1];

        if (last.volume > avgVol * 10) {
            const range = last.high - last.low;
            if (range > 0) {
                const closePct = (last.close - last.low) / range;
                if (closePct >= 0.8) {
                    return {
                        isSignal: true,
                        reason: `S18 Block Proxy: Extreme Volume Surge (${(last.volume / avgVol).toFixed(1)}x avg) with strong close.`,
                        metrics: { volMultiplier: last.volume / avgVol, closePct }
                    };
                }
            }
        }
        return { isSignal: false };
    }

    // Strategy S19: Delivery Volume Spike Threshold
    // Stealth institutional accumulation with 3 consecutive days of delivery > 300% of 20-day ADV.
    public evaluateS19_DeliverySpike(candles: Candle[]): ScanResult {
        if (candles.length < 23) return { isSignal: false };
        
        // We need the 20-day average volume prior to the 3-day spike.
        const prev = candles.slice(candles.length - 23, candles.length - 3);
        const avgVol = prev.reduce((sum, c) => sum + c.volume, 0) / 20;

        const last3 = candles.slice(candles.length - 3);
        const allSpikes = last3.every(c => c.volume > avgVol * 3 && c.close > c.open);

        if (allSpikes) {
            return {
                isSignal: true,
                reason: 'S19 Proxy: 3 consecutive days of >300% volume threshold indicating stealth accumulation.',
                metrics: { baselineVol: avgVol, spikeVols: last3.map(c => c.volume) }
            };
        }
        return { isSignal: false };
    }
}
