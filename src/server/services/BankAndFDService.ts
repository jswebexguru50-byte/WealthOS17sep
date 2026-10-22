import { DatabaseManager } from './DatabaseManager.js';

export interface BankOrFD {
  id?: number;
  portfolio: string;
  name: string;
  bank_name?: string;
  account_number?: string;
  ifsc_swift?: string;
  folio?: string;
  country: 'INDIA' | 'UAE' | 'USA' | 'OTHER';
  account_type: 'SAVINGS' | 'CURRENT' | 'FIXED_DEPOSIT' | 'RECURRING_DEPOSIT';
  currency: 'INR' | 'AED' | 'USD' | 'EUR' | 'GBP';
  balance_amount: number;       // Current value (may include accrued interest)
  principal_amount?: number;    // Original invested principal (before interest)
  interest_rate_pct: number;
  start_date?: string;          // Actual FD start date (when money was deposited at bank)
  maturity_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CurrencyRate {
  currency: string;
  rate_to_inr: number;
  source: string;
  updated_at: string;
}

export class BankAndFDService {
  private static instance: BankAndFDService;

  private constructor() {}

  public static getInstance(): BankAndFDService {
    if (!BankAndFDService.instance) {
      BankAndFDService.instance = new BankAndFDService();
    }
    return BankAndFDService.instance;
  }

  /**
   * Fetch all Bank Accounts & FDs
   */
  public async getAllBankAndFDs(portfolio?: string): Promise<BankOrFD[]> {
    const db = DatabaseManager.getInstance();
    if (portfolio && portfolio !== 'all' && portfolio !== 'Combined') {
      return await db.query<BankOrFD>('SELECT * FROM BankAccountsAndFDs WHERE portfolio = ? ORDER BY id DESC', [portfolio]);
    }
    return await db.query<BankOrFD>('SELECT * FROM BankAccountsAndFDs ORDER BY id DESC');
  }

  /**
   * Add or Update Bank Account / FD entry
   */
  public async saveBankOrFD(data: BankOrFD): Promise<{ id: number; message: string }> {
    const db = DatabaseManager.getInstance();
    const portfolio = data.portfolio && data.portfolio !== 'Default' ? data.portfolio : 'Maa';
    const name = data.name.trim();
    const bank_name = data.bank_name || '';
    const account_number = data.account_number || '';
    const ifsc_swift = data.ifsc_swift || '';
    const folio = data.folio || '';
    const country = data.country || 'INDIA';
    const account_type = data.account_type || 'SAVINGS';
    const currency = data.currency || 'INR';
    const balance = data.balance_amount || 0;
    const principal = data.principal_amount || 0;
    const interest = data.interest_rate_pct || 0;
    const maturity = data.maturity_date || null;
    const startDate = data.start_date || null;
    const notes = data.notes || '';

    if (data.id) {
      await db.execute(
        `UPDATE BankAccountsAndFDs 
         SET portfolio = ?, name = ?, bank_name = ?, account_number = ?, ifsc_swift = ?, folio = ?, country = ?, account_type = ?, currency = ?, balance_amount = ?, principal_amount = ?, interest_rate_pct = ?, start_date = ?, maturity_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [portfolio, name, bank_name, account_number, ifsc_swift, folio, country, account_type, currency, balance, principal, interest, startDate, maturity, notes, data.id]
      );
      return { id: data.id, message: 'Bank account / FD updated successfully.' };
    } else {
      await db.execute(
        `INSERT INTO BankAccountsAndFDs (portfolio, name, bank_name, account_number, ifsc_swift, folio, country, account_type, currency, balance_amount, principal_amount, interest_rate_pct, start_date, maturity_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [portfolio, name, bank_name, account_number, ifsc_swift, folio, country, account_type, currency, balance, principal, interest, startDate, maturity, notes]
      );
      const row = await db.get<{ id: number }>('SELECT last_insert_rowid() as id');
      return { id: row?.id || 0, message: 'Bank account / FD added successfully.' };
    }
  }

  /**
   * Delete Bank Account / FD
   */
  public async deleteBankOrFD(id: number): Promise<void> {
    const db = DatabaseManager.getInstance();
    await db.execute('DELETE FROM BankAccountsAndFDs WHERE id = ?', [id]);
  }

  /**
   * Get all live/cached FX rates to INR
   */
  public async getCurrencyRates(): Promise<Record<string, number>> {
    const db = DatabaseManager.getInstance();
    const rows = await db.query<CurrencyRate>('SELECT * FROM CurrencyRates');
    const map: Record<string, number> = { INR: 1.0, USD: 83.5, AED: 22.7, EUR: 90.8, GBP: 106.5 };

    for (const r of rows) {
      map[r.currency.toUpperCase()] = r.rate_to_inr;
    }
    return map;
  }

  /**
   * Fetch Live FX Rates from Yahoo Finance spot rate feeds with fallback to stored rates
   */
  public async fetchLiveXERates(): Promise<{ synced: boolean; rates: Record<string, number>; message: string }> {
    const db = DatabaseManager.getInstance();
    const updatedRates: Record<string, number> = { INR: 1.0 };
    let successCount = 0;

    const pairs: Record<string, string> = {
      USD: 'USDINR=X',
      AED: 'AEDINR=X',
      EUR: 'EURINR=X',
      GBP: 'GBPINR=X'
    };

    // Parallel fetch from Yahoo Finance query1 / query2 spot chart endpoints
    await Promise.all(
      Object.entries(pairs).map(async ([curr, ticker]) => {
        const hosts = ['https://query2.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
        for (const host of hosts) {
          try {
            const url = `${host}/v8/finance/chart/${ticker}?interval=1d&range=1d`;
            const res = await fetch(url, {
              signal: AbortSignal.timeout(5000),
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json'
              }
            });
            if (res.ok) {
              const json: any = await res.json();
              const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
              if (rate && rate > 0) {
                updatedRates[curr] = Math.round(rate * 100) / 100;
                successCount++;
                break;
              }
            }
          } catch (err) {
            // Try next host
          }
        }
      })
    );

    // Read cached database rates for fallback if any currency could not be fetched
    try {
      const dbRows = await db.query<CurrencyRate>('SELECT * FROM CurrencyRates');
      for (const r of dbRows) {
        if (!updatedRates[r.currency.toUpperCase()] && r.rate_to_inr > 0) {
          updatedRates[r.currency.toUpperCase()] = r.rate_to_inr;
        }
      }
    } catch (e) {}

    // Fallbacks to realistic market baseline if completely uninitialized
    if (!updatedRates.USD) updatedRates.USD = 86.80;
    if (!updatedRates.AED) updatedRates.AED = 23.63;
    if (!updatedRates.EUR) updatedRates.EUR = 94.50;
    if (!updatedRates.GBP) updatedRates.GBP = 110.20;

    const sourceLabel = successCount > 0 ? 'Yahoo Finance Live Spot Rate' : 'Cached / Reference Spot Rate';

    // Save updated rates to database
    for (const [curr, rate] of Object.entries(updatedRates)) {
      if (curr === 'INR' || !rate) continue;
      try {
        await db.execute(
          `INSERT INTO CurrencyRates (currency, rate_to_inr, source, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(currency) DO UPDATE SET rate_to_inr = excluded.rate_to_inr, source = excluded.source, updated_at = CURRENT_TIMESTAMP`,
          [curr, rate, sourceLabel]
        );
      } catch (e) {}
    }

    console.log(`[BankAndFDService] Synced FX rates (${successCount} pairs):`, updatedRates);

    return {
      synced: successCount > 0,
      rates: updatedRates,
      message: successCount > 0
        ? `Live currency rates synchronized successfully (${successCount} pairs). USD: â‚¹${updatedRates.USD}, AED: â‚¹${updatedRates.AED}, EUR: â‚¹${updatedRates.EUR}, GBP: â‚¹${updatedRates.GBP}`
        : `Using cached currency rates.`
    };
  }
}
