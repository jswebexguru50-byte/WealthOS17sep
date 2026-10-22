import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const rootDir = process.cwd();
const reviewsDir = path.resolve(rootDir, '.reviews');
const dbDir = path.resolve(rootDir, 'db');
const fixturesDir = path.resolve(rootDir, 'fixtures');

for (const d of [reviewsDir, dbDir, fixturesDir]) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

const dbPath = path.resolve(rootDir, 'data/portfolio_v6.3_research_subset.db');
if (!fs.existsSync(dbPath)) {
  console.error(`Error: Database not found at ${dbPath}`);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function queryGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || {});
    });
  });
}

async function exportSchemaAndSample() {
  const tables = await queryAll(`
    SELECT name, sql 
    FROM sqlite_master 
    WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `);

  const schemaJson = {
    database: 'portfolio_v6.3_research_subset.db',
    exportedAt: new Date().toISOString(),
    tables: {}
  };

  let sqlDump = `-- ====================================================================\n`;
  sqlDump += `-- WEALTHOS / ITAS v6.3: DATABASE SCHEMA AND SAMPLE RECORDS EXPORT\n`;
  sqlDump += `-- Exported At: ${new Date().toISOString()}\n`;
  sqlDump += `-- Database: portfolio_v6.3_research_subset.db\n`;
  sqlDump += `-- ====================================================================\n\n`;

  for (const t of tables) {
    const tableName = t.name;
    const tableSql = t.sql;

    // Columns & Indexes
    const columns = await queryAll(`PRAGMA table_info("${tableName}")`);
    const indexes = await queryAll(`PRAGMA index_list("${tableName}")`);
    const countRow = await queryGet(`SELECT count(*) as count FROM "${tableName}"`);
    const totalRows = countRow.count || 0;

    // Sample records
    let sampleQuery = `SELECT * FROM "${tableName}" LIMIT 10`;
    if (tableName === 'DailyOHLCV') {
      const checkSample = await queryAll(`SELECT * FROM "${tableName}" WHERE delivery_qty IS NOT NULL LIMIT 10`);
      if (checkSample.length > 0) {
        sampleQuery = `SELECT * FROM "${tableName}" WHERE delivery_qty IS NOT NULL LIMIT 10`;
      }
    }

    const sampleRows = await queryAll(sampleQuery);

    schemaJson.tables[tableName] = {
      totalRows,
      columns: columns.map(c => ({
        name: c.name,
        type: c.type,
        notNull: Boolean(c.notnull),
        primaryKey: Boolean(c.pk),
        defaultValue: c.dflt_value
      })),
      indexes: indexes.map(i => ({
        name: i.name,
        unique: Boolean(i.unique)
      })),
      ddl: tableSql,
      sampleRows
    };

    sqlDump += `-- Table: ${tableName} (Total Rows: ${totalRows})\n`;
    sqlDump += `${tableSql};\n\n`;

    if (sampleRows.length > 0) {
      sqlDump += `-- Sample Records for ${tableName} (${sampleRows.length} rows):\n`;
      for (const row of sampleRows) {
        const keys = Object.keys(row);
        const vals = keys.map(k => {
          const val = row[k];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        sqlDump += `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${vals.join(', ')});\n`;
      }
      sqlDump += '\n';
    }
  }

  db.close();

  // Write to .reviews/
  const sqlPath = path.join(reviewsDir, 'schema_and_sample.sql');
  const jsonPath = path.join(reviewsDir, 'schema_and_sample.json');
  fs.writeFileSync(sqlPath, sqlDump, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(schemaJson, null, 2), 'utf8');

  // Mirror to db/schema.sql and fixtures/sample_data.json
  fs.writeFileSync(path.join(dbDir, 'schema.sql'), sqlDump, 'utf8');
  fs.writeFileSync(path.join(fixturesDir, 'sample_data.json'), JSON.stringify(schemaJson, null, 2), 'utf8');

  console.log(`✓ Schema & sample data exported successfully:`);
  console.log(`  -> ${sqlPath} (${(fs.statSync(sqlPath).size / 1024).toFixed(1)} KB)`);
  console.log(`  -> ${jsonPath} (${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB)`);
  console.log(`  -> Mirrored to db/schema.sql and fixtures/sample_data.json`);
}

exportSchemaAndSample().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
