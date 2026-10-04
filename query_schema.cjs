const Database = require('better-sqlite3');
const db = new Database('portfolio.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='company_facts'").get());
