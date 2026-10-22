import * as fs from 'fs';
import * as path from 'path';
import { DataAcquisitionDaemon } from '../../src/server/services/dataAcquisition/DataAcquisitionDaemon';

async function main() {
  const configPath = path.resolve('config/v67/data-acquisition/data_acquisition_config.json');
  let customConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed.daemon) {
        customConfig = parsed.daemon;
      }
    } catch {
      // Use defaults
    }
  }

  console.log('================================================================');
  console.log(' WEALTHOS CONTINUOUS DATA ACQUISITION & ENRICHMENT DAEMON');
  console.log('================================================================');
  console.log('Target Universe: ~3,600 Securities (Indian Equity Universe)');
  console.log('Domains: D1 to D10 (Master, OHLCV, CorpActions, Financials, etc.)');
  console.log('Pipeline: RAW -> NORMALIZED -> PIT -> COVERAGE -> RESEARCH_READY');
  console.log('Production Promotion: FALSE | Live Trading: FALSE | S1-S20: FROZEN');
  console.log('Running as background process...');
  console.log('================================================================\n');

  const daemon = new DataAcquisitionDaemon(customConfig);

  const shutdown = () => {
    console.log('\n[Daemon Runner] Signal received. Terminating daemon cleanly...');
    daemon.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await daemon.start();
}

main().catch(err => {
  console.error('[Daemon Runner] Fatal uncaught error:', err);
  process.exit(1);
});
