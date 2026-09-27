import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const prodDbPath = path.resolve('portfolio.db');
const testDbPath = path.resolve('smoke_test.sqlite');

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');

const prodDb = new Database(prodDbPath, { readonly: true });
prodDb.backup(testDbPath).then(() => {
  prodDb.close();
  console.log('Database backup successful.');
}).catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
