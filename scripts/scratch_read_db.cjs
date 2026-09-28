const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT response_json FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND endpoint='parameters' LIMIT 1", (err, rows) => {
  if (err) console.error(err);
  else console.log(rows[0].response_json.substring(0, 1000));
});
