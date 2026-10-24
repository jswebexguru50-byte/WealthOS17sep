export type CostBasis='original_acquisition'|'pms_entry_market'|'remaining_pms_cost'|'remaining_original_cost';
export type DataQuality='CERTIFIED'|'PROVISIONAL'|'STALE'|'UNAVAILABLE';
export interface FinancialResultContract {
 portfolioIds:string[];memberScope:string;valuationAsOf:string|null;currency:string;
 costBasis:CostBasis;costBasisLabel:string;ledgerRevision:string|null;dataQuality:DataQuality;
 staleSince?:string;uncertifiedFields:string[];computedAt:string;
}
export const COST_BASIS_LABELS:Record<CostBasis,string>={
 original_acquisition:'Original acquisition cost',pms_entry_market:'PMS entry capital',
 remaining_pms_cost:'Remaining PMS book cost',remaining_original_cost:'Remaining original acquisition cost'
};
export function canDisplayFinancialResult(contract:FinancialResultContract):boolean {
 return Boolean(contract.portfolioIds.length && contract.memberScope && contract.valuationAsOf && contract.currency && contract.ledgerRevision && contract.costBasisLabel && contract.dataQuality!=='UNAVAILABLE');
}
