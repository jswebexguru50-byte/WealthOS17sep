/**
 * scripts/wealthos_ai_studio_api_bridge.ts
 *
 * Local REST API Bridge for Google AI Studio & Gemini.
 * Allows Google AI Studio (via Python Code Execution, Function Calling, or curl)
 * to dynamically query the live WealthOS SQLite database without copying files or
 * burning prompt tokens.
 */

import http from 'node:http';
import sqlite3 from 'sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 3005;
const WORKSPACE_ROOT = process.cwd();
const DB_PATH = path.join(WORKSPACE_ROOT, 'portfolio.db');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) console.error('Error opening database:', err);
  else console.log(`✓ Connected to authentic research database: ${DB_PATH}`);
});

function runQuery(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // 1. Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', database: path.basename(DB_PATH) }));
    return;
  }

  // 2. Schema listing
  if (url.pathname === '/api/schema') {
    try {
      const tables = await runQuery("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tables }));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 3. Dynamic SQL Query endpoint
  if (url.pathname === '/api/query' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const sql = payload.sql;
        const params = payload.params || [];

        // Enforce Read-Only queries
        const trimmed = sql.trim().toUpperCase();
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA') && !trimmed.startsWith('EXPLAIN')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Only read-only queries (SELECT, PRAGMA) are permitted.' }));
          return;
        }

        const rows = await runQuery(sql, params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ rowCount: rows.length, rows }));
      } catch (e: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`  WEALTHOS GOOGLE AI STUDIO LOCAL DB API BRIDGE RUNNING         `);
  console.log(`  Port: http://localhost:${PORT}                                 `);
  console.log(`  Endpoints:                                                    `);
  console.log(`    GET  /health      - Check bridge health                     `);
  console.log(`    GET  /api/schema  - Empty schemas & DDL                     `);
  console.log(`    POST /api/query   - Execute dynamic read-only SQL queries   `);
  console.log(`================================================================\n`);
});
