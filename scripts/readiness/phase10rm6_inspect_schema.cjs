#!/usr/bin/env node
'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const db = new Database(path.join(ROOT, 'portfolio.db'), { readonly: true });

// 1. Full DailyOHLCV column schema
const cols = db.prepare('PRAGMA table_info(DailyOHLCV)').all();
console.log('=== DailyOHLCV columns ===');
cols.forEach(c => {
  console.log(`  cid=${c.cid} name=${c.name} type=${c.type} pk=${c.pk} notnull=${c.notnull} dflt=${c.dflt_value}`);
});

// 2. All indexes
const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='DailyOHLCV'").all();
console.log('\n=== DailyOHLCV indexes ===');
if (idx.length === 0) console.log('  (none)');
idx.forEach(i => console.log('  ', i.name, ':', i.sql || '(auto/pk)'));

// 3. CREATE TABLE DDL
const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='DailyOHLCV'").get();
console.log('\n=== CREATE TABLE DailyOHLCV ===');
console.log(ddl ? ddl.sql : 'NOT FOUND');

// 4. Sample 5 rows to see what canonical identity looks like
const sample = db.prepare('SELECT symbol, trade_date, data_source, open, high, low, close, volume FROM DailyOHLCV LIMIT 5').all();
console.log('\n=== 5 sample rows ===');
sample.forEach(r => console.log('  ', JSON.stringify(r)));

// 5. Check whether (symbol, trade_date) is already guaranteed unique in the DB
const dupCheck = db.prepare('SELECT symbol, trade_date, COUNT(*) cnt FROM DailyOHLCV GROUP BY symbol, trade_date HAVING cnt > 1 LIMIT 5').all();
console.log('\n=== Duplicate (symbol, trade_date) pairs in DB ===');
console.log('  Count of dup pairs (first 5):', dupCheck.length === 0 ? 'NONE — (symbol, trade_date) is effectively unique' : JSON.stringify(dupCheck));

// 6. Check what fields are in the promotion manifest
const PROMO_FILE = path.join(ROOT, 'reports/market-data/PHASE10RM5Y_PROMOTION_MANIFEST.jsonl');
const lines = fs.readFileSync(PROMO_FILE, 'utf8').split('\n').filter(l => l.trim());
const firstRec = JSON.parse(lines[0]);
const lastRec  = JSON.parse(lines[lines.length - 1]);
console.log('\n=== Promotion manifest field schema (first record) ===');
console.log('  Fields:', Object.keys(firstRec).join(', '));
console.log('  First:', JSON.stringify(firstRec));
console.log('  Last: ', JSON.stringify(lastRec));

// 7. Does the manifest have a provider_key or instrument_key field?
const hasProviderKey   = firstRec.provider_key   !== undefined;
const hasInstrumentKey = firstRec.instrument_key  !== undefined;
const hasISIN          = firstRec.isin            !== undefined;
const hasExchange      = firstRec.exchange        !== undefined;
const hasSegment       = firstRec.segment         !== undefined;
console.log('\n=== Identity fields in promotion manifest ===');
console.log('  has provider_key:   ', hasProviderKey);
console.log('  has instrument_key: ', hasInstrumentKey);
console.log('  has isin:           ', hasISIN);
console.log('  has exchange:       ', hasExchange);
console.log('  has segment:        ', hasSegment);
console.log('  has symbol:         ', firstRec.symbol !== undefined);
console.log('  has trade_date:     ', firstRec.trade_date !== undefined);

db.close();
