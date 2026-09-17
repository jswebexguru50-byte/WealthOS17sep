import { MasterIndianUniverseService } from '../src/server/services/MasterIndianUniverseService.js';
import { getDB, dbAll } from '../src/server/database.js';

async function main() {
  console.log('Testing universe service...');
  const universe = MasterIndianUniverseService.getInstance();
  const res = await universe.getMasterUniverse();
  console.log('Total master symbols:', res.masterSymbols.length);
  console.log('Breakdown:', res.breakdown);
}

main().catch(console.error);
