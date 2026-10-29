#!/usr/bin/env node
'use strict';
// Exchange a single-use Kite request_token and persist the daily access token
// in the same AppConfig store used by the server and market-data jobs.
const crypto = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3');
try { require('dotenv').config({ path: path.join(process.cwd(), '.env') }); } catch {}

const requestToken = process.argv[2] || process.env.KITE_REQUEST_TOKEN;
const apiKey = String(process.env.KITE_API_KEY || '').trim();
const apiSecret = String(process.env.KITE_API_SECRET || '').trim();
if (!requestToken) throw new Error('Usage: node scripts/market_data/refresh_kite_token.cjs <request_token>');
if (!apiKey || !apiSecret) throw new Error('KITE_API_KEY and KITE_API_SECRET must be configured in .env');

(async () => {
  const checksum = crypto.createHash('sha256').update(`${apiKey}${requestToken}${apiSecret}`).digest('hex');
  const response = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
    body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.data?.access_token) throw new Error(payload?.message || `Kite session exchange failed (${response.status})`);
  const db = new Database(path.join(process.cwd(), 'portfolio.db'));
  const save = db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO AppConfig (key,value) VALUES ('Kite_Access_Token',?)").run(payload.data.access_token);
    db.prepare("INSERT OR REPLACE INTO AppConfig (key,value) VALUES ('Kite_Access_Token_Updated_At',?)").run(new Date().toISOString());
  });
  save(); db.close();
  console.log(JSON.stringify({ saved: true, userId: payload.data.user_id || null, updatedAt: new Date().toISOString() }, null, 2));
})().catch(error => { console.error(error.message); process.exit(1); });
