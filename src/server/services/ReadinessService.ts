import {dbAll,dbGet} from '../database.js';
/** Read-only. Unknown calendar/provider coverage is explicitly unavailable. */
export async function readReadiness(db:any, today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})) {
 try { await dbGet(db,'SELECT 1 AS ok'); } catch { return {statusCode:503,body:{process:'ok',db:{status:'error'},dataQuality:'UNAVAILABLE',checkedAt:new Date().toISOString()}}; }
 const feeds=await dbAll(db,"SELECT feed_id,source,last_successful_fetch_utc,current_state,last_error FROM data_feed_status WHERE feed_id NOT LIKE 'TEST%' AND source NOT LIKE 'TEST%'").catch(()=>[]);
 const sessions=await dbAll(db,'SELECT date FROM trading_calendar WHERE market=? AND is_trading_day=1 AND date<=? ORDER BY date DESC LIMIT 2',['NSE',today]).catch(()=>[]);
 const threshold=sessions.length===2?sessions[1].date:null;
 const stale=threshold ? await dbGet(db,"SELECT COUNT(*) AS n FROM Holdings WHERE quantity>0 AND currency='INR' AND holding_type='EQUITY' AND (last_update IS NULL OR substr(last_update,1,10)<?)",[threshold]) : null;
 const gains=await dbGet(db,"SELECT MAX(sell_date) AS latest FROM RealizedGains WHERE portfolio='cc9'").catch(()=>null);
 const sales=await dbGet(db,"SELECT MAX(date) AS latest FROM Transactions WHERE portfolio='cc9' AND type='SELL'").catch(()=>null);
 return {statusCode:200,body:{process:'ok',db:{status:'ok'},providers:feeds,providerCoverage:feeds.length?'RECORDED':'UNAVAILABLE',staleHoldings:stale?.n??null,calendarCoverage:threshold?'AVAILABLE':'UNAVAILABLE',cc9GainsAsOf:gains?.latest??null,cc9LatestSale:sales?.latest??null,cc9GainsQuality:gains?.latest&&gains.latest===sales?.latest?'PROVISIONAL':'STALE',checkedAt:new Date().toISOString()}};
}
