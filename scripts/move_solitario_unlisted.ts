import { getDB, dbRun, dbAll, createPersistentBackup } from '../src/server/database.js';
import { runFIFO } from '../src/server/fifoEngine.js';

async function moveSolitarioToUnlisted() {
  const db = getDB();
  console.log('1. Moving Solitario (INE1HBH01016) to Unlisted portfolio with symbol UL-Solitario...');

  // Update Transactions
  await dbRun(db, `
    UPDATE Transactions 
    SET portfolio = 'Unlisted', symbol = 'UL-Solitario', notes = 'Unlisted Private Placement Investment'
    WHERE isin = 'INE1HBH01016' OR symbol LIKE '%Solitario%'
  `);

  // Update MasterTickers
  await dbRun(db, `
    INSERT INTO MasterTickers (isin, symbol, name, segment, exchange, manual_ltp, manual_ltp_date, status)
    VALUES ('INE1HBH01016', 'UL-Solitario', 'UL-Solitario Lab Grown Diamonds', 'UNLISTED', 'UNLISTED', 11100.0, '2026-09-01', 'ACTIVE')
    ON CONFLICT(isin) DO UPDATE SET
      symbol = 'UL-Solitario',
      name = 'UL-Solitario Lab Grown Diamonds',
      segment = 'UNLISTED',
      manual_ltp = 11100.0,
      manual_ltp_date = '2026-09-01'
  `);

  console.log('2. Running FIFO Engine...');
  await runFIFO(db);

  console.log('3. Verifying Unlisted holdings...');
  const unlisted = await dbAll(db, `SELECT portfolio, symbol, isin, quantity, avg_buy_price, ltp, current_value, data_source FROM Holdings WHERE portfolio = 'Unlisted'`);
  console.table(unlisted);

  console.log('4. Verifying Maa holdings count...');
  const maa = await dbAll(db, `SELECT portfolio, symbol, isin, quantity, current_value FROM Holdings WHERE portfolio = 'Maa'`);
  console.log(`Maa Holdings Count: ${maa.length}`);

  createPersistentBackup();
  console.log('>>> Solitario successfully moved to Unlisted and locked!');
}

moveSolitarioToUnlisted().catch(console.error);
