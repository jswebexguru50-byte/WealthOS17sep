import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';

/** Sign-off recorded for this schema (spec amendment 1, section A.2). */
export const RESEARCH_V2_SIGNOFF = 'WEALTHOS_29Q_V2 schema: User Approved, 2026-10-10 (chat)';
/**
 * Placeholder: the integrator assigns the real number at merge (highest existing + 1; 014 is the highest
 * known today). The migration id and version both use this constant.
 */
export const RESEARCH_V2_MIGRATION_VERSION = 15;
export const RESEARCH_V2_MIGRATION_NAME = 'research_v2_schema';
/** Legacy provider whose company_facts rows were simulated and must be quarantined. */
export const QUARANTINED_PROVIDER = 'TRENDLYNE_MCP_MAX';

const SCHEMA_FILE = 'research_v2_schema.sql';

/** Read the schema SQL that sits next to this module (never relative to process.cwd()). */
export function readSchemaSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, SCHEMA_FILE), 'utf8');
}

/** sha256 of the schema SQL; changing the SQL changes the checksum (drift protection). */
export function schemaChecksum(sql: string = readSchemaSql()): string {
  return crypto.createHash('sha256').update(sql.trim()).digest('hex');
}

export interface QuarantineReport {
  /** company_facts exists. */
  tablePresent: boolean;
  /** The additive quarantined column was created by this call. */
  columnAdded: boolean;
  /** The provider column exists, so rows could be matched. */
  providerColumnPresent: boolean;
  /** Rows newly flagged by this call (already-flagged rows are not counted). */
  rowsQuarantined: number;
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

function tableExists(db: Database.Database, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}

/**
 * Guarded, non-destructive quarantine of simulated legacy rows. Does nothing unless company_facts exists.
 * Adds `quarantined INTEGER DEFAULT 0` if missing, then flags ONLY rows whose provider is
 * TRENDLYNE_MCP_MAX (and only when the provider column exists). Never deletes; never touches other tables.
 */
export function quarantineLegacyCompanyFacts(db: Database.Database): QuarantineReport {
  const report: QuarantineReport = {
    tablePresent: false, columnAdded: false, providerColumnPresent: false, rowsQuarantined: 0,
  };
  if (!tableExists(db, 'company_facts')) return report;
  report.tablePresent = true;
  let columns = columnNames(db, 'company_facts');
  if (!columns.includes('quarantined')) {
    db.exec('ALTER TABLE company_facts ADD COLUMN quarantined INTEGER DEFAULT 0');
    report.columnAdded = true;
    columns = columnNames(db, 'company_facts');
  }
  if (!columns.includes('provider')) return report;
  report.providerColumnPresent = true;
  const result = db
    .prepare('UPDATE company_facts SET quarantined = 1 WHERE provider = ? AND COALESCE(quarantined, 0) <> 1')
    .run(QUARANTINED_PROVIDER);
  report.rowsQuarantined = result.changes;
  return report;
}

/**
 * Apply the schema (idempotent) and the guarded quarantine. Atomic: opens its own transaction only when
 * the caller (for example the Migrator) has not already opened one.
 */
export function applyResearchV2Schema(db: Database.Database): QuarantineReport {
  const run = (): QuarantineReport => {
    db.exec(readSchemaSql());
    return quarantineLegacyCompanyFacts(db);
  };
  return db.inTransaction ? run() : db.transaction(run)();
}

/** Migration object for src/server/db/migrator.ts. Register it in migrations/index.ts at merge. */
export const researchV2Migration: Migration = {
  id: RESEARCH_V2_MIGRATION_VERSION,
  version: RESEARCH_V2_MIGRATION_VERSION,
  name: RESEARCH_V2_MIGRATION_NAME,
  get checksum(): string {
    return schemaChecksum();
  },
  up: (db: Database.Database) => {
    const raw = ((db as unknown as { db?: Database.Database }).db ?? db);
    const report = applyResearchV2Schema(raw);
    console.info(
      `[research_v2] ${RESEARCH_V2_SIGNOFF}; company_facts quarantined rows: ${report.rowsQuarantined}`,
    );
  },
};
