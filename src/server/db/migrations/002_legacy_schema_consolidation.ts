import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { Migration } from '../migrator.js';

/**
 * src/server/db/migrations/002_legacy_schema_consolidation.ts
 *
 * Migration 002: Consolidates legacy column additions into the versioned migration pipeline.
 * Idempotently ensures all auxiliary columns exist across MasterTickers, Portfolios,
 * Holdings, Transactions, BankAccountsAndFDs, TaxSummary, FamilyMembers, etc.
 */

function safeAddColumn(rawDb: any, table: string, colDef: string) {
  try {
    rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  } catch (e: any) {
    if (!e.message?.includes('duplicate column') && !e.message?.includes('no such table')) {
      throw e;
    }
  }
}

const MIGRATION_NAME = '002_legacy_schema_consolidation';
const checksum = crypto.createHash('sha256').update(MIGRATION_NAME).digest('hex');

export const migration002: Migration = {
  id: 2,
  name: MIGRATION_NAME,
  checksum,
  up: (db: any) => {
    const rawDb = db.db || db;

    // MasterTickers
    safeAddColumn(rawDb, 'MasterTickers', "currency TEXT DEFAULT 'INR'");
    safeAddColumn(rawDb, 'MasterTickers', "company_name TEXT");
    safeAddColumn(rawDb, 'MasterTickers', "fmv_31_jan_2018 REAL");

    // Portfolios
    safeAddColumn(rawDb, 'Portfolios', "base_currency TEXT DEFAULT 'INR'");
    safeAddColumn(rawDb, 'Portfolios', "pan TEXT");
    safeAddColumn(rawDb, 'Portfolios', "owner_name TEXT");

    // Holdings
    safeAddColumn(rawDb, 'Holdings', "prev_close REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "folio TEXT DEFAULT 'NA'");
    safeAddColumn(rawDb, 'Holdings', "currency TEXT DEFAULT 'INR'");
    safeAddColumn(rawDb, 'Holdings', "native_ltp REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "native_current_value REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "native_total_cost REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "native_avg_buy_price REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "native_unrealized_pnl REAL DEFAULT 0");
    safeAddColumn(rawDb, 'Holdings', "price_authority TEXT");
    safeAddColumn(rawDb, 'Holdings', "acquisition_fx_rate REAL DEFAULT 1.0");
    safeAddColumn(rawDb, 'Holdings', "holding_type TEXT DEFAULT 'EQUITY'");

    // ValuationSnapshots
    safeAddColumn(rawDb, 'ValuationSnapshots', "aif_value REAL NOT NULL DEFAULT 0");
    safeAddColumn(rawDb, 'ValuationSnapshots', "unlisted_value REAL NOT NULL DEFAULT 0");
    safeAddColumn(rawDb, 'ValuationSnapshots', "observationDate TEXT");
    safeAddColumn(rawDb, 'ValuationSnapshots', "observationTimestamp TEXT");
    safeAddColumn(rawDb, 'ValuationSnapshots', "timestampPrecision TEXT");

    // BankAccountsAndFDs
    safeAddColumn(rawDb, 'BankAccountsAndFDs', "bank_name TEXT");
    safeAddColumn(rawDb, 'BankAccountsAndFDs', "account_number TEXT");
    safeAddColumn(rawDb, 'BankAccountsAndFDs', "ifsc_swift TEXT");
    safeAddColumn(rawDb, 'BankAccountsAndFDs', "folio TEXT");

    // Transactions
    safeAddColumn(rawDb, 'Transactions', "broker_name TEXT");
    safeAddColumn(rawDb, 'Transactions', "account_number TEXT");
    safeAddColumn(rawDb, 'Transactions', "folio TEXT");
    safeAddColumn(rawDb, 'Transactions', "is_cash_flow INTEGER DEFAULT 1");
    safeAddColumn(rawDb, 'Transactions', "is_ca INTEGER DEFAULT 0");

    // FamilyMembers
    safeAddColumn(rawDb, 'FamilyMembers', "is_senior_citizen INTEGER DEFAULT 0");

    // CarriedForwardLosses
    safeAddColumn(rawDb, 'CarriedForwardLosses', "pan TEXT");

    // CamsSummaryHoldings
    safeAddColumn(rawDb, 'CamsSummaryHoldings', "folio TEXT DEFAULT 'NA'");

    // TaxSummary
    safeAddColumn(rawDb, 'TaxSummary', "intraday_gains REAL DEFAULT 0");
    safeAddColumn(rawDb, 'TaxSummary', "dividends REAL DEFAULT 0");

    // Indexes
    try {
      rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_portfolios_pan ON Portfolios(pan);`);
      rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_cfl_pan_fy ON CarriedForwardLosses(pan, financial_year);`);
    } catch {}

    // Idempotent Data Normalization & Updates
    try {
      rawDb.exec(`
        UPDATE Portfolios
        SET pan = 'BBFPS1002P', owner_name = 'Maa (Mother)'
        WHERE (pan IS NULL OR pan = '') AND (UPPER(name) LIKE '%MAA%' OR name IN ('cc9', 'Unlisted', 'IIFL360'));

        UPDATE Portfolios
        SET pan = 'ALRSP9041D', owner_name = 'Papa (Father)'
        WHERE (pan IS NULL OR pan = '') AND UPPER(name) LIKE '%PAPA%';

        UPDATE Portfolios
        SET pan = 'AQCPS7204G', owner_name = 'Gopal Sharma (Self)'
        WHERE (pan IS NULL OR pan = '') AND (UPPER(name) LIKE '%SELF%' OR name IN ('US - IBKR', 'Sarwa', 'Cash & FD', 'DBFS'));

        UPDATE Portfolios
        SET pan = 'DFYPS6605R', owner_name = 'Pankaj Sharma (Brother)'
        WHERE (pan IS NULL OR pan = '') AND (UPPER(name) LIKE '%BROTHER%' OR UPPER(name) LIKE '%PANKAJ%');

        UPDATE Portfolios
        SET pan = 'POOJA_PAN_PENDING', owner_name = 'Pooja Sharma'
        WHERE (pan IS NULL OR pan = '') AND UPPER(name) LIKE '%POOJA%';
      `);
    } catch {}
  }
};
