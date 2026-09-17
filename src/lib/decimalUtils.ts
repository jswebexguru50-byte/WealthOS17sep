/**
 * INFRA-2: Decimal Precision Standard
 * Spec: dev_spec_opportunity_engine.md Section 2, INFRA-2
 */
export function roundINR(value: number, decimals: number = 2): number {
  if (!isFinite(value) || isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
export function paise(inrAmount: number): number {
  return Math.round(inrAmount * 100);
}
export function fromPaise(paiseAmount: number): number {
  return paiseAmount / 100;
}
export function sumINR(values: number[]): number {
  const totalPaise = values.reduce((acc, v) => acc + Math.round(v * 100), 0);
  return totalPaise / 100;
}
export function mulINR(priceINR: number, quantity: number): number {
  const pricePaise = Math.round(priceINR * 100);
  const resultPaise = Math.round(pricePaise * quantity);
  return resultPaise / 100;
}
export function divideINR(numerator: number, denominator: number): number {
  if (Math.abs(denominator) < 0.0001) return 0;
  return numerator / denominator;
}
export function formatINR(value: number): string {
  const rounded = roundINR(value);
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatPct(value: number, decimals: number = 2): string {
  return (value * 100).toFixed(decimals) + '%';
}
export function applyBonusAdjustment(originalQty: number, bonusRatio: number, originalAvgCost: number) {
  const totalCost = mulINR(originalAvgCost, originalQty);
  const bonusQty = Math.floor(originalQty * bonusRatio);
  const newQty = originalQty + bonusQty;
  const newAvgCost = newQty > 0 ? roundINR(totalCost / newQty, 4) : 0;
  return { newQty, newAvgCost, totalCost };
}
export function applySplitAdjustment(originalQty: number, splitMultiplier: number, originalAvgCost: number) {
  const totalCost = mulINR(originalAvgCost, originalQty);
  const newQty = Math.round(originalQty * splitMultiplier);
  const newAvgCost = newQty > 0 ? roundINR(totalCost / newQty, 4) : 0;
  return { newQty, newAvgCost, totalCost };
}
const CUTOVER_DATE = '2024-07-23';
const LTCG_EXEMPTION_OLD = 100000;
const LTCG_EXEMPTION_NEW = 125000;
export function stcgRate(sellDate: string): number { return sellDate >= CUTOVER_DATE ? 0.20 : 0.15; }
export function ltcgRate(sellDate: string): number { return sellDate >= CUTOVER_DATE ? 0.125 : 0.10; }
export function ltcgExemptionLimit(sellDate: string): number { return sellDate >= CUTOVER_DATE ? LTCG_EXEMPTION_NEW : LTCG_EXEMPTION_OLD; }
export function computeSTCGTax(gain: number, sellDate: string): number { if (gain <= 0) return 0; return roundINR(gain * stcgRate(sellDate)); }
export function computeLTCGTaxPreExemption(gain: number, sellDate: string): number { if (gain <= 0) return 0; return roundINR(gain * ltcgRate(sellDate)); }
