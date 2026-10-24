const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
test('orchestrator loads newest 300 bars in chronological order',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../scripts/fundamental/ScanToDossierOrchestrator.ts'),'utf8');
 const sql=source.match(/SELECT date, o, h, l, c, v FROM \([\s\S]*?\) ORDER BY date ASC/)[0];
 const db=new Database(':memory:');
 try{
  db.exec('CREATE TABLE DailyOHLCV(symbol TEXT,trade_date TEXT,open REAL,high REAL,low REAL,close REAL,volume REAL)');
  const insert=db.prepare('INSERT INTO DailyOHLCV VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<500;i++)insert.run('TEST',new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),1,2,0,1,1);
  const bars=db.prepare(sql).all('TEST');
  assert.equal(bars.length,300);assert.equal(bars[0].date,'2024-07-19');assert.equal(bars[299].date,'2025-05-14');
 }finally{db.close();}
});
