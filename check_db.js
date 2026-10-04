const Database = require('better-sqlite3');
const db = new Database('portfolio.db');
const tables = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
    console.log(table.sql);
}
db.close();
