const Database = require('better-sqlite3');
const db = new Database('portfolio.db', {readonly: true});
console.log(db.prepare("SELECT sector, industry FROM MasterTickers WHERE UPPER(symbol) = 'HDFCBANK'").get());
