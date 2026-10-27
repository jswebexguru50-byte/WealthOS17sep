import sqlite3 from 'sqlite3';

export async function initializeIntelligenceTables(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Evidence inventory is the parent of every claim/event foreign key.
      // Create it before the child tables so a fresh database cannot enter a
      // partially initialised state where the quality gate queries a missing
      // table (or claims are created without enforceable lineage).
      db.run(`
        CREATE TABLE IF NOT EXISTS EvidenceInventory (
          evidence_id TEXT PRIMARY KEY,
          issuer_nse_symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          document_hash TEXT NOT NULL,
          document_type TEXT NOT NULL,
          page_physical INTEGER,
          page_printed TEXT,
          quoted_text TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_evidence_symbol ON EvidenceInventory(issuer_nse_symbol);`);

      // 2. Management Claims Ledger
      db.run(`
        CREATE TABLE IF NOT EXISTS ManagementClaims (
          claim_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          period TEXT NOT NULL,
          category TEXT NOT NULL,
          statement TEXT NOT NULL,
          target_metric TEXT,
          baseline_value REAL,
          expected_value REAL,
          expected_outcome TEXT,
          expected_timeframe TEXT,
          evidence_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          actual_outcome_metric REAL,
          actual_outcome_description TEXT,
          resolution_evidence_id TEXT,
          resolved_at TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (evidence_id) REFERENCES EvidenceInventory(evidence_id)
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_claims_symbol ON ManagementClaims(symbol);`);

      // 3. Material Factual Events (Internal Disclosures & Curated External)
      db.run(`
        CREATE TABLE IF NOT EXISTS IntelligenceEvents (
          event_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          event_date TEXT NOT NULL,
          category TEXT NOT NULL,
          headline TEXT NOT NULL,
          description TEXT,
          source_type TEXT NOT NULL,
          evidence_id TEXT,
          materiality TEXT NOT NULL DEFAULT 'MATERIAL',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_events_symbol ON IntelligenceEvents(symbol);`);

      // 4. Contradiction Register
      db.run(`
        CREATE TABLE IF NOT EXISTS Contradictions (
          contradiction_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          issuer_bse_code TEXT,
          severity TEXT NOT NULL,
          contradiction_type TEXT NOT NULL,
          claim_id TEXT,
          event_id TEXT,
          description TEXT NOT NULL,
          divergence_json TEXT,
          supporting_evidence_ids TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          materiality TEXT NOT NULL DEFAULT 'THESIS_RELEVANT',
          resolved_at TEXT,
          resolution_note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (claim_id) REFERENCES ManagementClaims(claim_id)
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_contradictions_symbol ON Contradictions(symbol);`);

      // 5. Thesis & Thesis Breaker Register
      db.run(`
        CREATE TABLE IF NOT EXISTS CompanyTheses (
          thesis_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          thesis_statement TEXT NOT NULL,
          core_pillars_json TEXT NOT NULL,
          thesis_breakers_json TEXT NOT NULL,
          active_status INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_theses_symbol ON CompanyTheses(symbol);`, (err) => {
        if (err) {
          console.error('[IntelligenceSchema] Error initializing tables:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}
