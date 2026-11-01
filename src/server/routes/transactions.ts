/**
 * src/server/routes/transactions.ts
 * Transaction CRUD, bulk operations, master tickers, export
 */
import { Router } from 'express';
import * as XLSX from 'xlsx';
import { getDB, auditDBChange } from '../database.js';
import { runFIFO } from '../fifoEngine.js';
import { BankAndFDService } from '../services/BankAndFDService.js';
import { TransactionsRepository } from '../services/TransactionsRepository.js';
import { fetchRealIsinFromNet } from '../camsParser.js';
import { getSelectedPortfolios } from './shared.js';

const router = Router();

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '50');
    const search = (req.query.search as string || '').trim().toUpperCase();
    const typeFilter = (req.query.type as string || '').trim();
    const startDate = (req.query.start_date as string || '').trim();
    const endDate = (req.query.end_date as string || '').trim();
    const selected = await getSelectedPortfolios(req);

    let baseQuery = `
      FROM Transactions T
      LEFT JOIN MasterTickers M ON T.isin = M.isin
      LEFT JOIN Portfolios P ON T.portfolio = P.name
      WHERE 1=1
    `;
    const params: any[] = [];

    if (selected) {
      baseQuery += ` AND T.portfolio IN (${selected.map(() => '?').join(',')})`;
      params.push(...selected);
    }
    if (search) {
      baseQuery += ` AND (T.symbol LIKE ? OR T.isin LIKE ? OR M.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (typeFilter) {
      const tf = typeFilter.toUpperCase();
      if (tf === 'BUY') baseQuery += ` AND (UPPER(T.type) LIKE 'BUY%' OR UPPER(T.type) LIKE 'IPO%' OR UPPER(T.type) LIKE 'ALLOTMENT%')`;
      else if (tf === 'SELL') baseQuery += ` AND (UPPER(T.type) LIKE 'SELL%' OR UPPER(T.type) LIKE 'REDEMPTION%' OR UPPER(T.type) LIKE 'MERGED%')`;
      else if (tf === 'DIVIDEND') baseQuery += ` AND UPPER(T.type) LIKE '%DIVIDEND%'`;
      else { baseQuery += ` AND UPPER(T.type) = ?`; params.push(tf); }
    }
    if (startDate) { baseQuery += ` AND T.date >= ?`; params.push(startDate); }
    if (endDate) { baseQuery += ` AND T.date <= ?`; params.push(endDate); }

    const countRow: any = await repo.countTransactions(db, baseQuery, params);
    const total = countRow?.count || 0;

    const sortCol = (req.query.sort_col as string || '').trim().toLowerCase();
    const sortDir = (req.query.sort_dir as string || 'desc').trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderMap: Record<string, string> = {
      date: `T.date ${sortDir}, T.id ${sortDir}`,
      portfolio: `T.portfolio ${sortDir}, T.date DESC`,
      type: `T.type ${sortDir}, T.date DESC`,
      symbol: `T.symbol ${sortDir}, T.date DESC`,
      quantity: `T.quantity ${sortDir}, T.date DESC`,
      price: `T.price ${sortDir}, T.date DESC`,
      net_amount: `T.net_amount ${sortDir}, T.date DESC`,
    };
    const orderClause = orderMap[sortCol] || 'T.date DESC, T.id DESC';

    const data = await repo.getTransactions(db, 'SELECT T.*, M.name as company_name, P.base_currency', baseQuery, orderClause, limit, (page - 1) * limit, params);

    const fxRates = await BankAndFDService.getInstance().getCurrencyRates();
    const usdRate = fxRates.USD || 83.5;
    const enriched = data.map((t: any) => {
      const isUsd = t.base_currency === 'USD' || t.portfolio === 'US - IBKR' || t.isin?.startsWith('US');
      return { ...t, currency: isUsd ? 'USD' : 'INR', rate_to_inr: isUsd ? usdRate : 1.0 };
    });

    res.json({ data: enriched, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const { date, portfolio, type, symbol, isin, quantity, price, gross_amount, brokerage, net_amount, notes, broker_name, account_number, folio } = req.body;

    if (!portfolio?.trim() || portfolio.trim().toLowerCase() === 'default') {
      return res.status(400).json({ success: false, message: 'Please select an explicit active portfolio. "Default" is not allowed.' });
    }

    let resolvedIsin = isin || '';
    let resolvedSymbol = symbol || '';
    const existing: any = await repo.findTickerBySymbolOrIsin(db, symbol, isin);
    if (existing) {
      resolvedIsin = existing.isin || resolvedIsin;
      resolvedSymbol = existing.symbol || resolvedSymbol;
    } else {
      if (!resolvedIsin && resolvedSymbol) {
        try { const netIsin = await fetchRealIsinFromNet(resolvedSymbol); if (netIsin) resolvedIsin = netIsin; } catch {}
      }
      const masterRow: any = await repo.findIsinBySymbol(db, resolvedSymbol);
      if (masterRow?.isin) {
        resolvedIsin = masterRow.isin;
      } else if (!resolvedIsin) {
        resolvedIsin = `CUSTOM_${resolvedSymbol.replace(/\s+/g, '')}`.slice(0, 12);
        await repo.insertMutualFundTicker(db, resolvedIsin, resolvedSymbol);
      }
    }

    const txTypeUpper = String(type).toUpperCase();
    const isCashFlow = (txTypeUpper.includes('REINVEST') || txTypeUpper.includes('REINVESTMENT')) ? 0 : 1;
    const result = await repo.insertTransaction(db, {
      date, portfolio, type, isin: resolvedIsin, symbol: resolvedSymbol,
      quantity, price,
      gross_amount: gross_amount || (quantity * price),
      brokerage: brokerage || 0,
      net_amount: net_amount || (quantity * price),
      notes: notes || '', isCashFlow,
      broker_name: broker_name || '', account_number: account_number || '', folio: folio || ''
    });

    await auditDBChange(db, 'Transactions', 'INSERT', result.lastID, `Manual transaction for ${resolvedSymbol}`);
    await runFIFO(db);
    res.json({ success: true, id: result.lastID });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const id = req.params.id;
    let { date, portfolio, type, symbol, isin, quantity, price, gross_amount, brokerage, net_amount, notes } = req.body;
    let resolvedSymbol = symbol ? String(symbol).trim() : '';
    let resolvedIsin = isin ? String(isin).trim() : '';

    if (resolvedSymbol) {
      const match: any = await repo.findTickerBySymbolOrName(db, resolvedSymbol);
      if (match) { resolvedSymbol = match.symbol || resolvedSymbol; resolvedIsin = match.isin || resolvedIsin; }
    }
    if (!resolvedIsin && resolvedSymbol) {
      const match: any = await repo.findIsinBySymbolStrict(db, resolvedSymbol);
      if (match?.isin) resolvedIsin = match.isin;
    }

    const isCashFlow = String(type).toUpperCase().includes('REINVEST') ? 0 : 1;
    await repo.updateTransaction(db, id, {
      date, portfolio, type, isin: resolvedIsin, symbol: resolvedSymbol,
      quantity, price, gross_amount, brokerage, net_amount, notes: notes || '', isCashFlow
    });
    await auditDBChange(db, 'Transactions', 'UPDATE', parseInt(id), `Updated transaction ${id}`);
    await runFIFO(db);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    await repo.deleteTransaction(db, req.params.id);
    await auditDBChange(db, 'Transactions', 'DELETE', parseInt(req.params.id), `Deleted transaction ${req.params.id}`);
    await runFIFO(db);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/transactions/bulk
router.post('/bulk', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const { action, ids, fields } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, message: 'No transaction IDs provided' });

    if (action === 'DELETE') {
      await repo.bulkDeleteTransactions(db, ids);
    } else if (action === 'UPDATE' && fields) {
      const clauses: string[] = [];
      const params: any[] = [];
      if (fields.date) { clauses.push('date = ?'); params.push(fields.date); }
      if (fields.portfolio) { clauses.push('portfolio = ?'); params.push(fields.portfolio); }
      if (fields.type) { clauses.push('type = ?'); params.push(fields.type); }
      if (fields.symbol) { clauses.push('symbol = ?'); params.push(fields.symbol); }
      if (fields.isin) { clauses.push('isin = ?'); params.push(fields.isin); }
      if (!clauses.length) return res.status(400).json({ success: false, message: 'No valid update fields provided' });
      await repo.bulkUpdateTransactions(db, clauses, params, ids);
    }

    await runFIFO(db);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/transactions/export
router.get('/export', async (_req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const [txns, cas, holdings] = await Promise.all([
      repo.getAllTransactions(db),
      repo.getAllCorporateActions(db),
      repo.getAllHoldings(db),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txns), 'Transactions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cas), 'Corporate Actions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(holdings), 'Holdings');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio_export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/master-tickers (legacy alias — also served by /api/tickers)
router.get('/master-tickers', async (_req, res) => {
  try {
    const db = getDB();
    res.json(await TransactionsRepository.getInstance().getAllMasterTickers(db));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/master-tickers/:id (with holdings cascade)
router.put('/master-tickers/:id', async (req, res) => {
  try {
    const db = getDB();
    const repo = TransactionsRepository.getInstance();
    const id = req.params.id;
    const { isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    await repo.updateMasterTicker(db, id, {
      isin, symbol, name, exchange, sector, manual_ltp,
      manual_ltp_date: manual_ltp ? new Date().toISOString() : null,
      fmv_31_jan_2018
    });

    // Cascade manual LTP to holdings
    if (manual_ltp !== undefined && manual_ltp !== null) {
      const matchHoldings = await repo.getHoldingsBySymbolOrIsin(db, symbol, isin);
      for (const h of matchHoldings as any[]) {
        const cv = h.quantity * manual_ltp;
        const pnl = cv - h.total_cost;
        const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
        await repo.updateHoldingLtp(db, manual_ltp, cv, pnl, pct, h.portfolio, h.isin, h.symbol, h.folio || 'NA');
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/master-tickers/upsert-by-isin
router.put('/master-tickers/upsert-by-isin', async (req, res) => {
  try {
    const db = getDB();
    const { isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    if (!isin) return res.status(400).json({ success: false, message: 'ISIN is required' });
    await TransactionsRepository.getInstance().upsertMasterTickerByIsin(db, { isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018 });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
