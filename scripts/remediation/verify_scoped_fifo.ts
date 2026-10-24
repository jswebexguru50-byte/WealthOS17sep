/** Stage-only verifier. The manifest must identify a verified backup and its SHA-256.
 * Never accepts the live database path. No financial source records are embedded.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import sqlite3 from 'sqlite3';import assert from 'node:assert/strict';
import {cc9StatementPerformance} from '../../src/server/services/Cc9StatementPerformance.js';
import {runFIFO} from '../../src/server/fifoEngine.js';
import {dbAll,dbGet,setDbMockHooks} from '../../src/server/database.js';
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const backupPath=fs.realpathSync(manifest.backup),stagePath=fs.realpathSync(manifest.stage);
assert.notEqual(stagePath,path.resolve('portfolio.db'),'Refusing live DB');assert.notEqual(stagePath,backupPath);
const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(backupPath))hash.update(chunk);
assert.equal(hash.digest('hex'),manifest.sha256,'Backup SHA-256 mismatch');
const db=new sqlite3.Database(stagePath);
const tables=['Transactions','Holdings','RealizedGains','TaxSummary','CorporateActionAudit','PmsSourceEvidence'];
async function state(other=false){const out:any={};for(const t of tables)out[t]=await dbAll(db,`SELECT * FROM ${t}`+(other?" WHERE portfolio <> 'cc9'":'')+' ORDER BY rowid');return JSON.stringify(out);}
const original=await state(),others=await state(true);
await assert.rejects(runFIFO(db),/EXPLICIT_FIFO_PORTFOLIO_REQUIRED/);
let injected=false;
setDbMockHooks({dbRun:(sql,params)=>new Promise((resolve,reject)=>{
 if(!injected && sql.startsWith('INSERT INTO PmsPerformanceRealizedGains')){injected=true;reject(new Error('INJECTED_REBUILD_FAILURE'));return;}
 db.run(sql,params,function(error){if(error)reject(error);else resolve({lastID:this.lastID,changes:this.changes});});
})});
try{await assert.rejects(runFIFO(db,'cc9'),/INJECTED_REBUILD_FAILURE/);}finally{setDbMockHooks({});}
assert.ok(injected);assert.equal(await state(),original,'Rollback must preserve data');
const result=await runFIFO(db,'cc9');assert.equal(await state(true),others,'Unrelated portfolios changed');
const diffs=await dbAll(db,`SELECT p.symbol,p.quantity AS expected,h.quantity AS actual FROM PmsSummaryHoldings p LEFT JOIN Holdings h ON h.portfolio=p.portfolio AND h.isin=p.isin WHERE p.portfolio='cc9' AND (h.quantity IS NULL OR ABS(h.quantity-p.quantity)>.001)`);assert.deepEqual(diffs,[]);
const gains=await dbGet(db,"SELECT MAX(sell_date) AS latest,COUNT(*) AS matches FROM PmsPerformanceRealizedGains WHERE portfolio='cc9'");
const latest=await dbGet(db,"SELECT MAX(date) AS latest FROM Transactions WHERE portfolio='cc9' AND type='SELL'");assert.equal(gains.latest,latest.latest);
const cost=await dbGet(db,"SELECT SUM(total_cost) AS cost FROM Holdings WHERE portfolio='cc9' AND symbol<>'CASH'");
const expected=await dbGet(db,"SELECT SUM(total_cost) AS cost FROM PmsSummaryHoldings WHERE portfolio='cc9'");assert.ok(Math.abs(cost.cost-expected.cost)<.02);
const performance=await cc9StatementPerformance(db);assert.ok(performance);assert.ok(Math.abs(performance.xirr-8.5745311427)<.000001);assert.ok(Math.abs(performance.nav-65231599.04)<.01);
const output={statementPerformance:performance,status:'STAGE_PASSED',result,latestPerformanceSale:gains.latest,performanceLotMatches:gains.matches,remainingPmsCost:cost.cost,rollbackVerified:true,otherPortfoliosUnchanged:true,taxGainsRebuilt:false,liveApplied:false};
fs.writeFileSync(path.join(path.dirname(process.argv[2]),'scoped_fifo_result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
await new Promise<void>((resolve,reject)=>db.close(e=>e?reject(e):resolve()));
