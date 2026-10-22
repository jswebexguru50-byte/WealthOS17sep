import sqlite3 from 'sqlite3';
import fs from 'fs';

const db = new sqlite3.Database('portfolio.db');
db.all('SELECT response_json FROM fundamental_endpoint_snapshots WHERE endpoint=\'parameters\' LIMIT 1', (err, rows: any[]) => {
  if (err) throw err;
  const data = JSON.parse(rows[0].response_json);
  const text = JSON.parse(data.content[0].text).data;
  fs.writeFileSync('scratch_out.txt', text);
});
