#!/usr/bin/env node
/** Remove only non-unique DailyOHLCV indexes covered by its exact UNIQUE key.
 * Makes a consistent online SQLite backup before mutations; never drops tables.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
const candidates=['idx_daily_ohlcv_symbol','idx_daily_ohlcv_sym','idx_daily_ohlcv_sym_date'];
function keys(db,name){return db.prepare(`PRAGMA index_xinfo("${name}")`).all().filter(c=>c.key).map(c=>({name:c.name,desc:c.desc,coll:c.coll}));}
export function plan(db){
 const indexes=db.prepare('PRAGMA index_list("DailyOHLCV")').all();
 const primary=indexes.find(i=>i.unique&&JSON.stringify(keys(db,i.name))===JSON.stringify([{name:'symbol',desc:0,coll:'BINARY'},{name:'trade_date',desc:0,coll:'BINARY'}]));
 if(!primary)throw new Error('Expected unique (symbol, trade_date) index not found; no changes allowed');
 return indexes.filter(i=>candidates.includes(i.name)&&!i.unique&&!i.partial).filter(i=>{
  const columns=keys(db,i.name);return columns.length>0&&columns.length<=2&&JSON.stringify(columns)===JSON.stringify(keys(db,primary.name).slice(0,columns.length));
 }).map(i=>i.name);
}
async function main(){
 if(process.argv.includes('--self-test')){
  const db=new Database(':memory:');db.exec('CREATE TABLE DailyOHLCV(symbol TEXT,trade_date TEXT,close REAL,UNIQUE(symbol,trade_date)); CREATE INDEX idx_daily_ohlcv_symbol ON DailyOHLCV(symbol); CREATE UNIQUE INDEX idx_daily_ohlcv_sym ON DailyOHLCV(symbol,close); CREATE INDEX idx_daily_ohlcv_sym_date ON DailyOHLCV(symbol,trade_date) WHERE close>0');
  assert.deepEqual(plan(db),['idx_daily_ohlcv_symbol']);db.close();console.log('Index checks passed: preserves unique, partial, and unrelated indexes.');return;
 }
 const arg=name=>process.argv[process.argv.indexOf(name)+1];
 if(!process.argv.includes('--db'))throw new Error('--db is required');
 const file=path.resolve(arg('--db')),apply=process.argv.includes('--apply');
 if(apply&&!process.argv.includes('--backup'))throw new Error('--backup is mandatory for --apply');
 const db=new Database(file,{readonly:!apply});
 try{
  const indexes=plan(db);console.log(JSON.stringify({database:file,indexes,mode:apply?'apply':'plan'}));
  if(!apply||!indexes.length)return;
  const backup=path.resolve(arg('--backup'));
  if(backup===file||fs.existsSync(backup))throw new Error('Backup must be a new path, distinct from live database');
  fs.mkdirSync(path.dirname(backup),{recursive:true});await db.backup(backup);
  const copy=new Database(backup,{readonly:true});assert.equal(copy.pragma('quick_check',{simple:true}),'ok');copy.close();
  const count=db.prepare('SELECT COUNT(*) n FROM DailyOHLCV').get().n;
  db.transaction(()=>{assert.deepEqual(plan(db),indexes);for(const index of indexes)db.exec(`DROP INDEX "${index}"`);})();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM DailyOHLCV').get().n,count);
  db.exec('ANALYZE DailyOHLCV');
  console.log(JSON.stringify({backup,removed:indexes,rowsPreserved:count,queryPlan:db.prepare('EXPLAIN QUERY PLAN SELECT * FROM DailyOHLCV WHERE symbol=? ORDER BY trade_date DESC LIMIT 300').all('TCS'),freelistPages:db.pragma('freelist_count',{simple:true})}));
 }finally{db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
