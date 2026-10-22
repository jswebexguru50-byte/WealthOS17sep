/**
 * src/server/routes/masterTickers.ts
 * Master Tickers routes: list, update with holdings cascade, upsert by ISIN
 */
import { Router } from 'express';
import { getDB, dbAll, dbRun, withTx } from '../database.js';

const router = Router();

// GET /api/master-tickers
router.get('/', async (_req, res) => {
  try {
    const db = getDB();
    res.json(await dbAll(db, 'SELECT * FROM MasterTickers ORDER BY symbol ASC'));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/master-tickers/:id (with holdings cascade)
router.put('/:id', async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;
    const { isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    await dbRun(db, `UPDATE MasterTickers SET isin=?, symbol=?, name=?, exchange=?, sector=?, manual_ltp=?, manual_ltp_date=?, fmv_31_jan_2018=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [isin, symbol, name, exchange, sector, manual_ltp, manual_ltp ? new Date().toISOString() : null, fmv_31_jan_2018, id]);

    // Cascade manual LTP to holdings
    if (manual_ltp !== undefined && manual_ltp !== null) {
      const matchHoldings = await dbAll(db, 'SELECT portfolio, isin, symbol, quantity, total_cost, folio FROM Holdings WHERE symbol = ? OR isin = ?', [symbol, isin]);
      await withTx(db, async () => {
        for (const h of matchHoldings as any[]) {
          const cv = h.quantity * manual_ltp;
          const pnl = cv - h.total_cost;
          const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
          await dbRun(db, `UPDATE Holdings SET ltp=?, current_value=?, unrealized_pnl=?, unrealized_pct=?, data_source='Manual Entry', last_update=CURRENT_TIMESTAMP WHERE portfolio=? AND isin=? AND symbol=? AND folio=?`,
            [manual_ltp, cv, pnl, pct, h.portfolio, h.isin, h.symbol, h.folio || 'NA']);
        }
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/master-tickers/upsert-by-isin
router.put('/upsert-by-isin', async (req, res) => {
  try {
    const db = getDB();
    const { isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    if (!isin) return res.status(400).json({ success: false, message: 'ISIN is required' });
    await dbRun(db, `INSERT INTO MasterTickers (isin, symbol, name, exchange, sector, manual_ltp, fmv_31_jan_2018) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isin) DO UPDATE SET symbol=COALESCE(excluded.symbol, MasterTickers.symbol), name=CASE WHEN excluded.name!='' THEN excluded.name ELSE MasterTickers.name END, exchange=COALESCE(excluded.exchange, MasterTickers.exchange), sector=CASE WHEN excluded.sector!='' THEN excluded.sector ELSE MasterTickers.sector END, manual_ltp=COALESCE(excluded.manual_ltp, MasterTickers.manual_ltp), fmv_31_jan_2018=COALESCE(excluded.fmv_31_jan_2018, MasterTickers.fmv_31_jan_2018)`,
      [isin, symbol || '', name || '', exchange || 'NYSE', sector || '', manual_ltp || null, fmv_31_jan_2018 || 0]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
