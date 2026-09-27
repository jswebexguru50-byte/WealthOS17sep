import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  console.log("Updating schemas for Phase 1B in: " + dbPath);

  // Drop old company_facts and field_mapping_catalog to rebuild with exact new schema
  await run(db, `DROP TABLE IF EXISTS company_facts;`);
  await run(db, `DROP TABLE IF EXISTS field_mapping_catalog;`);

  await run(db, `
    CREATE TABLE company_facts (
      factId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT,
      
      metric TEXT NOT NULL,
      value TEXT,
      unit TEXT,
      currency TEXT,
      
      periodType TEXT NOT NULL,
      periodStart TEXT,
      periodEnd TEXT,
      asOfDate TEXT NOT NULL,
      reportedAt TEXT,
      
      factType TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      
      scope TEXT NOT NULL, -- CONSOLIDATED, STANDALONE, UNKNOWN
      
      provider TEXT,
      sourceDocumentId TEXT,
      sourceUrl TEXT,
      evidenceText TEXT,
      evidencePage INTEGER,
      
      verificationStatus TEXT NOT NULL,
      
      parentFactIds TEXT,
      calculationMethod TEXT,
      
      fetchedAt TEXT NOT NULL,
      freshnessTtlDays INTEGER,

      UNIQUE(symbol, metric, periodEnd, periodType, scope, factType)
    );
  `);
  
  await run(db, `CREATE INDEX idx_company_facts_symbol_metric ON company_facts(symbol, metric);`);

  await run(db, `
    CREATE TABLE field_mapping_catalog (
      provider TEXT NOT NULL,
      provider_token TEXT NOT NULL,
      provider_label TEXT,
      canonical_metric TEXT NOT NULL,
      statement_type TEXT,
      period_type TEXT NOT NULL,
      unit TEXT,
      currency TEXT,
      scale TEXT,
      consolidated_or_standalone TEXT,
      source_frequency TEXT,
      mapping_status TEXT NOT NULL,
      verified_at TEXT,
      verification_method TEXT,
      notes TEXT,
      PRIMARY KEY (provider, provider_token)
    );
  `);

  console.log("Successfully rebuilt company_facts and field_mapping_catalog for Phase 1B.");
  db.close();
}

main().catch(console.error);
