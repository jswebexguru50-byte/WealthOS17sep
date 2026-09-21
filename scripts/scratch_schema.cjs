const db = require('better-sqlite3')('portfolio.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE name='MasterTickers'").get();
console.log(schema);
