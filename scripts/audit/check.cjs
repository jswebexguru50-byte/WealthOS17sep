const db = require('better-sqlite3')('data/portfolio_v6.3_research_subset.db');
console.log('portfolio_v6.3_research_subset.db tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
try {
  const db2 = require('better-sqlite3')('data/wealthos_market_data.sqlite');
  console.log('wealthos_market_data.sqlite tables:', db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
} catch(e) {}
try {
  const db3 = require('better-sqlite3')('data/portfolio_v6.3_pilot_research.db');
  console.log('portfolio_v6.3_pilot_research.db tables:', db3.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
} catch(e) {}
