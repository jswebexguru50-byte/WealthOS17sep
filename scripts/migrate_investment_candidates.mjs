import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('portfolio.db');

const sql = `
CREATE TABLE IF NOT EXISTS InvestmentCandidates (
    candidateId TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    companyName TEXT NOT NULL,
    sector TEXT,
    engineId TEXT NOT NULL,
    pipelineStage TEXT NOT NULL,
    compositeScore REAL,
    actionVerdict TEXT,
    isPromoted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    fundamentalConfidence INTEGER DEFAULT 0,
    technicalsConfidence INTEGER DEFAULT 0,
    activeTranches JSON,
    evidenceCache JSON
);
`;

db.run(sql, (err) => {
  if (err) {
    console.error("Error creating table:", err);
  } else {
    console.log("InvestmentCandidates table created successfully.");
  }
  db.close();
});
