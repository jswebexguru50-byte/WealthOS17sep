export function holdingCost(row:any) {
 const currency=String(row.currency || 'INR').toUpperCase();
 const nativeCost=currency==='INR' ? row.total_cost : row.native_total_cost;
 const average=row.quantity>0 && nativeCost!=null ? nativeCost/row.quantity : null;
 // Only an explicitly evidenced historic rate qualifies. Legacy defaults are not evidence.
 const historicalFx=row.historic_fx_source && Number.isFinite(row.historic_fx_rate) && row.historic_fx_rate>0 ? row.historic_fx_rate : null;
 return {nativeCost:nativeCost??null,nativeAverage:average,costInINR:currency==='INR'?row.total_cost??null:historicalFx===null?null:nativeCost==null?null:nativeCost*historicalFx,
 costQuality:currency!=='INR' && historicalFx===null?'UNKNOWN_FX':nativeCost==null?'UNAVAILABLE':'CERTIFIED'};
}
