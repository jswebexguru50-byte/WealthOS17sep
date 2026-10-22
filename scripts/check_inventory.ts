import Database from 'better-sqlite3';
import { Analyze360Service } from '../src/server/services/Analyze360Service.js';

const db = new Database('portfolio.db', { readonly: true });

async function run() {
  const svc = Analyze360Service.getInstance();
  const testSymbols = ['RELIANCE', 'TCS', 'APLAPOLLO', 'BAJFINANCE'];
  for (const sym of testSymbols) {
    console.log(`\n=================== ${sym} ===================`);
    const master = db.prepare("SELECT * FROM MasterTickers WHERE symbol = ?").get(sym) as any;
    console.log('MasterTicker:', master ? { isin: master.isin, company_name: master.company_name, sector: master.sector } : 'NOT FOUND');
    
    const factCount = (db.prepare("SELECT COUNT(*) as c FROM company_facts WHERE symbol = ?").get(sym) as any).c;
    console.log('company_facts count:', factCount);
    
    const finCount = (db.prepare("SELECT COUNT(*) as c FROM HistoricalFinancialStatements WHERE symbol = ?").get(sym) as any).c;
    console.log('HistoricalFinancialStatements count:', finCount);

    const shareCount = (db.prepare("SELECT COUNT(*) as c FROM HistoricalShareholdingPattern WHERE symbol = ?").get(sym) as any).c;
    console.log('HistoricalShareholdingPattern count:', shareCount);

    try {
      const res = await svc.getAnalyze360View(sym, undefined, undefined, undefined, undefined, { includeTechnicals: false });
      console.log('Analyze360 View:');
      console.log('  Company:', res.companyProfile?.companyName, '| Sector:', res.companyProfile?.sector);
      console.log('  Revenue 3Y CAGR:', res.fundamental?.revenueGrowth?.status, res.fundamental?.revenueGrowth?.value);
      console.log('  Profitability PAT:', res.fundamental?.profitability?.pat?.status, res.fundamental?.profitability?.pat?.value);
      console.log('  QGLP Quality:', res.qglp?.qualityScore, 'Final:', res.qglp?.finalScore, 'Classification:', res.qglp?.classification);
      console.log('  Action Readiness:', res.actionReadiness?.status);
    } catch (e: any) {
      console.error('Analyze360 error:', e.message);
    }
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
