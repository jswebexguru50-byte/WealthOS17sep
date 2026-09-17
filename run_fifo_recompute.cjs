const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('portfolio.db');

async function recompute() {
  const { runFIFO } = require('./dist/server.cjs');
  console.log('Running FIFO recompute...');
  try {
    const res = await runFIFO(db);
    console.log('FIFO_RESULT:', res);
  } catch (err) {
    console.error('FIFO_ERR:', err);
  }

  db.all("SELECT * FROM Holdings WHERE portfolio = 'IIFL360'", [], (err, rows) => {
    console.log('IIFL360_HOLDINGS_AFTER_FIFO:', rows);
  });
}

recompute();
