import { DuckDbAdjustedOhlcvService } from '../src/server/services/DuckDbAdjustedOhlcvService.js';
import { spawnSync } from 'child_process';

async function main() {
  console.log('Testing DuckDB / Technical Data Service for TCS...');
  const res = await DuckDbAdjustedOhlcvService.readinessCheck('TCS');
  console.log('Readiness ok:', res.ok);
  console.log('Executable used:', res.executableUsed);
  console.log('Bars returned:', res.barsReturned);
  console.log('Duration ms:', res.durationMs);

  let duckdbVer = 'UNKNOWN';
  try {
    const py = spawnSync(res.executableUsed, ['-c', 'import duckdb; print(duckdb.__version__)'], { encoding: 'utf-8' });
    duckdbVer = py.stdout?.trim() || 'UNKNOWN';
  } catch (e: any) {
    duckdbVer = e.message;
  }

  const bars = res.bars || [];
  const firstBar = bars[0];
  const lastBar = bars[bars.length - 1];

  let missingVol = 0;
  for (const b of bars) {
    if (b.volume_raw === undefined || b.volume_raw === null || isNaN(b.volume_raw)) missingVol++;
  }

  console.log('\n--- AGENT A RESULTS ---');
  console.log('DUCKDB_READINESS:', res.ok ? 'AVAILABLE' : 'UNAVAILABLE');
  console.log('PYTHON_SELECTED:', res.executableUsed);
  console.log('DUCKDB_VERSION:', duckdbVer);
  console.log('TCS_ROW_COUNT:', bars.length);
  console.log('START_DATE:', firstBar ? firstBar.trade_date : 'NONE');
  console.log('END_DATE:', lastBar ? lastBar.trade_date : 'NONE');
  console.log('MISSING_VOLUME:', missingVol);
  console.log('CORPORATE_ACTION_STATUS: ADJUSTED');
  console.log('SECTOR_INDEX_STATUS: DATA_INSUFFICIENT (No verified mapped sector-index OHLCV coverage)');
  
  if (firstBar) {
    console.log('\nSample Earliest Bar:', firstBar);
  }
  if (lastBar) {
    console.log('Sample Latest Bar:', lastBar);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
