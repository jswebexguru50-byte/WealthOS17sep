/**
 * scripts/export_empty_schema_sql.ts
 *
 * Exports the complete, clean DDL schema (all CREATE TABLE, CREATE INDEX,
 * CREATE VIEW statements) from portfolio.db into root schema.sql.
 * Zero data rows included.
 */

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const WORKSPACE_ROOT = process.cwd();
const DB_PATH = path.join(WORKSPACE_ROOT, 'portfolio.db');
const OUTPUT_SCHEMA = path.join(WORKSPACE_ROOT, 'schema.sql');

function runAllSql(db: sqlite3.Database, query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function main() {
  console.log(`Exporting empty schema from ${DB_PATH}...`);
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

  const objects = await runAllSql(
    db,
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'view' THEN 2 WHEN 'index' THEN 3 ELSE 4 END, name"
  );

  let output = `-- ================================================================\n`;
  output += `-- WEALTHOS / ITAS v6.3 - PRODUCTION EMPTY DATABASE SCHEMA\n`;
  output += `-- Generated: ${new Date().toISOString()}\n`;
  output += `-- Source: portfolio.db (DDL Only - 0 Data Rows)\n`;
  output += `-- Total Schema Objects: ${objects.length}\n`;
  output += `-- ================================================================\n\n`;

  let tableCount = 0;
  let indexCount = 0;
  let viewCount = 0;

  for (const obj of objects) {
    if (obj.type === 'table') tableCount++;
    if (obj.type === 'index') indexCount++;
    if (obj.type === 'view') viewCount++;

    output += `-- [${obj.type.toUpperCase()}] ${obj.name}\n`;
    output += `${obj.sql.trim()};\n\n`;
  }

  fs.writeFileSync(OUTPUT_SCHEMA, output, 'utf8');

  const stats = fs.statSync(OUTPUT_SCHEMA);
  console.log(`✓ Exported empty schema to ${OUTPUT_SCHEMA}`);
  console.log(`✓ Tables: ${tableCount}, Indexes: ${indexCount}, Views: ${viewCount}`);
  console.log(`✓ Schema file size: ${(stats.size / 1024).toFixed(1)} KB`);
}

main();
