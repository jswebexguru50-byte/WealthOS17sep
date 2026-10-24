/** Indian April–March fiscal calendar. Only explicitly labelled source periods qualify. */
export function sourcePeriodEnd(period:unknown):string|null {
 if(typeof period!=='string')return null;
 const m=/^(?:Q([1-4]))?FY(\d{4})$/i.exec(period.replace(/\s+/g,''));if(!m)return null;
 const year=Number(m[2]);if(year<1900||year>2200)return null;
 return m[1]?({'1':`${year-1}-06-30`,'2':`${year-1}-09-30`,'3':`${year-1}-12-31`,'4':`${year}-03-31`} as Record<string,string>)[m[1]]:`${year}-03-31`;
}
