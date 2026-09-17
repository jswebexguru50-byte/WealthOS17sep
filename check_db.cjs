const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

db.all("SELECT id, generated_at FROM OpportunityEngineReports", (err, rows) => {
  if (err) console.error("Err Reports:", err);
  else console.log("OpportunityEngineReports:", rows);
});

db.all("SELECT symbol, last_updated_at FROM OpportunityScripEvaluations", (err, rows) => {
  if (err) console.error("Err Scrips:", err);
  else console.log("OpportunityScripEvaluations count:", rows ? rows.length : 0);
  db.close();
});
