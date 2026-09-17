const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('portfolio.db');

console.log('Clearing old stale cache in OpportunityEngineReports and OpportunityScripEvaluations...');

db.serialize(() => {
  db.run("DELETE FROM OpportunityEngineReports WHERE id = 'LATEST_DASHBOARD'", (err) => {
    if (err) console.error("Error clearing OpportunityEngineReports:", err);
    else console.log("Cleared OpportunityEngineReports LATEST_DASHBOARD.");
  });

  db.run("DELETE FROM OpportunityScripEvaluations", (err) => {
    if (err) console.error("Error clearing OpportunityScripEvaluations:", err);
    else console.log("Cleared OpportunityScripEvaluations cache.");
  });
  
  db.close((err) => {
    if (err) console.error("Error closing db:", err);
    else console.log("Database cache successfully refreshed.");
  });
});
