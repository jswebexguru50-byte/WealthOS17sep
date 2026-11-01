import type { Database } from 'sqlite3';
import { dbAll, dbGet, dbRun } from '../database.js';

export class MiscRepository {
  private static instance: MiscRepository;
  static getInstance(): MiscRepository {
    if (!MiscRepository.instance) MiscRepository.instance = new MiscRepository();
    return MiscRepository.instance;
  }

  getPortfolioNames(db: Database): Promise<any[]> {
    return dbAll<any>(
      db,
      `SELECT DISTINCT portfolio FROM Holdings UNION SELECT DISTINCT portfolio FROM Transactions UNION SELECT name FROM Portfolios`
    );
  }

  getFallbackPortfolios(db: Database): Promise<any[]> {
    return dbAll<any>(
      db,
      `SELECT DISTINCT portfolio FROM Holdings WHERE portfolio IS NOT NULL UNION SELECT DISTINCT portfolio FROM Transactions WHERE portfolio IS NOT NULL`
    );
  }

  insertFemaRepatriation(db: Database, financialYear: string, remittanceDate: string, portfolio: string, sourceAccountNro: string, destinationCountry: string, remittedAmountInr: any, fxRateUsdInr: any, remittedAmountUsd: any, form15caAckNo: any, form15cbCertNo: any, caMembershipNo: any, purposeCode: string): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO FemaRepatriationLedger (financial_year, remittance_date, portfolio, source_account_nro, destination_country, remitted_amount_inr, fx_rate_usd_inr, remitted_amount_usd, form_15ca_ack_no, form_15cb_cert_no, ca_membership_no, purpose_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [financialYear, remittanceDate, portfolio, sourceAccountNro, destinationCountry, remittedAmountInr, fxRateUsdInr, remittedAmountUsd, form15caAckNo, form15cbCertNo, caMembershipNo, purposeCode]
    );
  }

  getAccountProfiles(db: Database): Promise<any[]> {
    return dbAll<any>(db, `SELECT * FROM AccountProfiles ORDER BY portfolio_name ASC`);
  }

  upsertAccountProfile(db: Database, portfolioName: string, accountType: string, dematScheme: string, designatedBank: any, bankAccountNumber: any, pisPermissionRef: any, residentCountry: string, taxResidencyStatus: string): Promise<void> {
    return dbRun(
      db,
      `INSERT INTO AccountProfiles (portfolio_name, account_type, demat_scheme, designated_bank, bank_account_number, pis_permission_ref, resident_country, tax_residency_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(portfolio_name) DO UPDATE SET
         account_type = excluded.account_type,
         demat_scheme = excluded.demat_scheme,
         designated_bank = excluded.designated_bank,
         bank_account_number = excluded.bank_account_number,
         pis_permission_ref = excluded.pis_permission_ref,
         resident_country = excluded.resident_country,
         tax_residency_status = excluded.tax_residency_status,
         updated_at = CURRENT_TIMESTAMP`,
      [portfolioName, accountType, dematScheme, designatedBank, bankAccountNumber, pisPermissionRef, residentCountry, taxResidencyStatus]
    );
  }

  getFereStock(db: Database, cleanSymbol: string, rawSymbol: string): Promise<any> {
    return dbGet<any>(
      db,
      `SELECT * FROM FEREEnrichedLedger WHERE symbol = ? OR symbol = ? LIMIT 1`,
      [cleanSymbol, rawSymbol]
    );
  }
}
