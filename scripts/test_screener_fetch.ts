import { ScreenerService } from '../src/server/services/screenerService.js';

async function main() {
  const s = ScreenerService.getInstance();
  for (const sym of ['BAJAJHFL', 'GOKEX', 'HAL', 'BEL', 'AKIKO']) {
    console.log(`\n--- Testing Screener for ${sym} ---`);
    const data = await s.fetchScreenerData(sym);
    if (!data) {
      console.log(`${sym}: RETURNED NULL!`);
    } else {
      console.log(`${sym}: Company=${data.company_name}, Sector=${data.sector}`);
      console.log(`  ROCE=${data.ratios?.roce}, ROE=${data.ratios?.roe}, D/E=${data.ratios?.debt_to_equity}, PE=${data.ratios?.stock_pe}, MCAP=${data.ratios?.market_cap}`);
      console.log(`  Shareholding: Promoters=${data.shareholding?.promoters}, FII=${data.shareholding?.fiis}, DII=${data.shareholding?.diis}`);
    }
  }
}

main().catch(console.error);
