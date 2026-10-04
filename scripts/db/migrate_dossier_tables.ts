import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('portfolio.db');
const db = new Database(dbPath);

const tables = [
  `CREATE TABLE IF NOT EXISTS dossier_runs (
    dossierRunId TEXT PRIMARY KEY,
    requestMode TEXT NOT NULL,
    requestedTradingSessions INTEGER,
    requestedFrom TEXT,
    requestedTo TEXT,
    actualTradingDates TEXT NOT NULL, -- JSON array
    scanAsOf TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    status TEXT NOT NULL,
    strategiesConfig TEXT, -- JSON
    ohlcvAsOf TEXT,
    completedAt TEXT,
    failureState TEXT
  )`,
  
  `CREATE TABLE IF NOT EXISTS dossier_candidates (
    candidateId TEXT PRIMARY KEY,
    dossierRunId TEXT NOT NULL,
    symbol TEXT NOT NULL,
    convergenceCount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    FOREIGN KEY(dossierRunId) REFERENCES dossier_runs(dossierRunId)
  )`,
  
  `CREATE TABLE IF NOT EXISTS dossier_signals (
    signalId TEXT PRIMARY KEY,
    candidateId TEXT NOT NULL,
    dossierRunId TEXT NOT NULL,
    symbol TEXT NOT NULL,
    strategyId TEXT NOT NULL,
    strategyName TEXT NOT NULL,
    signalDate TEXT NOT NULL,
    signalPrice REAL,
    technicalEvidence TEXT, -- JSON
    FOREIGN KEY(candidateId) REFERENCES dossier_candidates(candidateId),
    FOREIGN KEY(dossierRunId) REFERENCES dossier_runs(dossierRunId)
  )`,
  
  `CREATE TABLE IF NOT EXISTS dossier_analysis_snapshots (
    analysisSnapshotId TEXT PRIMARY KEY,
    dossierRunId TEXT NOT NULL,
    candidateId TEXT NOT NULL,
    symbol TEXT NOT NULL,
    analysisType TEXT NOT NULL,
    asOf TEXT NOT NULL,
    content TEXT NOT NULL, -- JSON
    analysisVersion TEXT NOT NULL,
    generatedAt TEXT NOT NULL,
    FOREIGN KEY(candidateId) REFERENCES dossier_candidates(candidateId)
  )`,
  
  `CREATE TABLE IF NOT EXISTS dossier_artifacts (
    dossierArtifactId TEXT PRIMARY KEY,
    dossierRunId TEXT NOT NULL,
    artifactType TEXT NOT NULL,
    fileName TEXT NOT NULL,
    storageLocation TEXT NOT NULL,
    contentHash TEXT NOT NULL,
    fileSize INTEGER,
    generatedAt TEXT NOT NULL,
    generatorVersion TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(dossierRunId) REFERENCES dossier_runs(dossierRunId)
  )`
];

for (const sql of tables) {
  db.prepare(sql).run();
}

console.log("Successfully created dossier lifecycle tables.");
db.close();
