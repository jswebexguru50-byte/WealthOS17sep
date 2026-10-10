/**
 * src/server/db/migrations/index.ts
 *
 * Registry of all canonical database migrations for WealthOS.
 */

import type Database from 'better-sqlite3';
import { Migrator, Migration } from '../migrator.js';
import { migration001 } from './001_baseline_schema.js';
import { migration002 } from './002_legacy_schema_consolidation.js';
import { migration003 } from './003_reconciliation_exceptions.js';
import { migration004 } from './004_security_identity_aliases.js';
import { migration005 } from './005_fix_stripping_index.js';
import { migration006 } from './006_family_governance_register.js';
import { migration007 } from './007_risk_policies_alerts.js';
import { migration008 } from './008_reports_nri_tracking.js';
import { migration009 } from './009_document_vault_compliance.js';

export const canonicalMigrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005, migration006, migration007, migration008, migration009
];

export const canonicalMigrator = new Migrator(canonicalMigrations);

export async function runDatabaseMigrations(
  db: any
): Promise<{ applied: number; currentVersion: number }> {
  const migrator = new Migrator(canonicalMigrations);
  return migrator.runPending(db);
}

