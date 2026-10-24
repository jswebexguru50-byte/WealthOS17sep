/** Provenance envelope required for all user-facing financial results. */
export type CostBasis = 'original_acquisition' | 'pms_entry_market' | 'remaining_pms_cost';
export type DataQuality = 'CERTIFIED' | 'PROVISIONAL' | 'STALE' | 'UNAVAILABLE';
export interface FinancialResultContract {
  portfolioIds: string[]; memberScope: string; valuationAsOf: string; currency: string;
  costBasis: CostBasis; costBasisLabel: string; ledgerRevision: string; dataQuality: DataQuality;
  staleSince?: string; uncertifiedFields: string[]; computedAt: string;
}
export const costBasisLabels: Record<CostBasis, string> = {
  original_acquisition: 'Original acquisition cost', pms_entry_market: 'PMS entry market value', remaining_pms_cost: 'Remaining PMS statement cost',
};
export const COST_BASIS_LABELS = costBasisLabels;
/** A financial figure is not presentable unless its required provenance exists. */
export function canDisplayFinancialResult(value: Partial<FinancialResultContract> | null | undefined): boolean {
  return Boolean(value && Array.isArray(value.portfolioIds) && value.portfolioIds.length &&
    value.memberScope && value.valuationAsOf && value.currency && value.costBasis &&
    value.costBasisLabel && value.ledgerRevision && value.dataQuality && value.computedAt);
}
