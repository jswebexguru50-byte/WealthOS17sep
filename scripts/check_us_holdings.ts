import { getDB, dbAll } from '../src/server/database.js';

async function check() {
  const db = getDB();
  const rows = await dbAll(db, `SELECT portfolio, symbol, quantity, ltp, native_ltp, current_value, native_current_value, currency FROM Holdings WHERE portfolio IN ('US - IBKR', 'Sarwa')`);
  console.table(rows);
}
check();
