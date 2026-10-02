const DB = require('better-sqlite3')('portfolio.db');
DB.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token', 'j5QzRIyMqqWkXl4SN0ayH9NFz24PiQ0M')").run();
DB.close();
console.log('Done!');
