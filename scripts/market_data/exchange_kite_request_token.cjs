#!/usr/bin/env node
'use strict';

// Local environment uses an inspected TLS proxy; server.ts uses the same setting
// for its Upstox and market-data requests.

require('dotenv').config();
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const requestToken = process.argv[2];
const apiKey = process.env.KITE_API_KEY;
const secret = process.env.KITE_API_SECRET;
if (!requestToken || !apiKey || !secret) {
  throw new Error('Usage: node exchange_kite_request_token.cjs <request-token>; Kite credentials must be in .env.');
}

const checksum = crypto.createHash('sha256').update(apiKey + requestToken + secret).digest('hex');
fetch('https://api.kite.trade/session/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
  body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
}).then(async response => {
  const payload = await response.json();
  if (!response.ok || !payload?.data?.access_token) throw new Error(payload?.message || `Kite session exchange failed (${response.status}).`);
  const db = new Database('portfolio.db');
  try {
    db.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token', ?)").run(payload.data.access_token);
    db.prepare("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token_Updated_At', ?)").run(new Date().toISOString());
  } finally { db.close(); }
  console.log(JSON.stringify({ linked: true, user_id: payload.data.user_id, login_time: payload.data.login_time }));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
