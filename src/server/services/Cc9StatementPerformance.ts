import crypto from 'node:crypto';
import {dbAll,dbGet} from '../database.js';
import {calculateXIRR} from '../xirr.js';
import {COST_BASIS_LABELS,type FinancialResultContract} from '../../types/FinancialResultContract.js';
/** Read-only statement-date calculation. It does not infer original purchase chronology. */
export async function cc9StatementPerformance(db:any) {
 const cash=await dbGet(db,"SELECT * FROM PmsStatementCashBalances WHERE portfolio='cc9' ORDER BY statement_date DESC LIMIT 1");
 if(!cash)return null;
 const rows=await dbAll(db,"SELECT * FROM PmsSummaryHoldings WHERE portfolio='cc9' AND statement_date=? ORDER BY isin",[cash.statement_date]);
 if(!rows.length)return null;
 const tx=await dbAll(db,"SELECT id,date,type,net_amount,is_cash_flow,is_ca FROM Transactions WHERE portfolio='cc9' AND date <= ? ORDER BY date,id",[cash.statement_date]);
 const external=tx.filter((t:any)=>t.is_cash_flow===1 && !t.is_ca && ['DEPOSIT','WITHDRAWAL','TRANSFER IN','SECURITY IN','TRANSFER OUT','SECURITY OUT'].includes(t.type));
 const flows=external.map((t:any)=>({date:new Date(t.date+'T00:00:00Z'),amount:Math.abs(t.net_amount)*(['WITHDRAWAL','TRANSFER OUT','SECURITY OUT'].includes(t.type)?1:-1)}));
 const nav=rows.reduce((s:number,r:any)=>s+r.current_value,0)+cash.net_cash;
 if(!flows.some((f:any)=>f.amount<0))return null;
 flows.push({date:new Date(cash.statement_date+'T00:00:00Z'),amount:nav});
 const revision=crypto.createHash('sha256').update(JSON.stringify({tx,rows,cash})).digest('hex');
 const contract:FinancialResultContract={portfolioIds:['cc9'],memberScope:'cc9',valuationAsOf:cash.statement_date,currency:'INR',costBasis:'pms_entry_market',costBasisLabel:COST_BASIS_LABELS.pms_entry_market,ledgerRevision:revision,dataQuality:'CERTIFIED',uncertifiedFields:['originalAcquisitionLotChronology','taxableGains'],computedAt:new Date().toISOString()};
 return {contract,xirr:calculateXIRR(flows),nav,netExternalCapital:-flows.slice(0,-1).reduce((s:number,f:any)=>s+f.amount,0),remainingPmsCost:rows.reduce((s:number,r:any)=>s+r.total_cost,0)};
}
