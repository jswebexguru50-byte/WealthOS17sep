import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { existsSync, writeFileSync } from 'fs';

// This script aims to perform the "explicit token discovery/verification exercise" 
// mandated by the Phase 1 Implementation Spec.

const dbPath = 'portfolio.db';

async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  // Create CompanyFact schema as per Phase 1
  await db.exec(`
    CREATE TABLE IF NOT EXISTS company_facts (
      factId TEXT PRIMARY KEY,
      companyId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT,
      
      metric TEXT NOT NULL,
      value TEXT, -- Stores number, string, boolean or null
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
      
      parentFactIds TEXT, -- JSON array
      calculationMethod TEXT,
      
      fetchedAt TEXT NOT NULL,
      freshnessTtlDays INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_company_facts_symbol_metric ON company_facts(symbol, metric);
  `);
  
  console.log("Phase 1: CompanyFact table schema verified.");
  
  // Fetch some sample data from fundamental_endpoint_snapshots
  const sample = await db.get(`SELECT response_json FROM fundamental_endpoint_snapshots WHERE provider='TRENDLYNE_MCP' AND endpoint='parameters' LIMIT 1`);
  if (!sample) {
      console.log("No sample data in fundamental_endpoint_snapshots.");
      return;
  }
  
  const data = JSON.parse(sample.response_json);
  // Just print the keys that exist in the snapshot to understand what's already mapped
  console.log("Available keys in sample payload (from previous fetches):");
  
  // The MCP returns plain text as a string typically. Let's see how it looks
  const text = data?.content?.[0]?.text || data?.data;
  if (typeof text === 'string') {
      const lines = text.split('\\n').slice(0, 50);
      console.log(lines.join('\\n'));
  } else {
      console.log(Object.keys(data || {}).join(', '));
  }
}

main().catch(console.error);
