const db = require('better-sqlite3')('portfolio.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='company_facts'").get());
