import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL?.replace(/^sqlite:\/\//, '') || path.join(process.cwd(), 'portfolio.db');

async function run(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<void>((resolve, reject) => db.run(sql, params, err => err ? reject(err) : resolve()));
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  console.log("Setting up Canonical Fact Layer in: " + dbPath);

  // Schema for Phase 1: CompanyFact
  await run(db, `
    CREATE TABLE IF NOT EXISTS company_facts (
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
      
      provider TEXT,
      sourceDocumentId TEXT,
      sourceUrl TEXT,
      evidenceText TEXT,
      evidencePage INTEGER,
      
      verificationStatus TEXT NOT NULL,
      
      parentFactIds TEXT,
      calculationMethod TEXT,
      
      fetchedAt TEXT NOT NULL,
      freshnessTtlDays INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_company_facts_symbol_metric ON company_facts(symbol, metric);
  `);
  
  // Create mapping table for known verified parameters to ensure we do not "assume" 
  // but explicitly map discovered Trendlyne parameters to canonical metrics.
  await run(db, `
    CREATE TABLE IF NOT EXISTS field_mapping_catalog (
      provider TEXT NOT NULL,
      providerToken TEXT NOT NULL,
      canonicalMetric TEXT NOT NULL,
      periodType TEXT NOT NULL,
      factType TEXT NOT NULL,
      PRIMARY KEY (provider, providerToken)
    );
  `);

  console.log("Successfully created CompanyFact and field_mapping_catalog tables.");
  db.close();
}

main().catch(console.error);
