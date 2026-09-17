/**
 * src/server/routes/settings.ts
 * App config, family benchmark, scrip mappings, master tickers, preferences
 */
import { Router } from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { FamilyBenchmarkService } from '../services/FamilyBenchmarkService.js';
import { AssetScripMappingService } from '../services/AssetScripMappingService.js';
import { MasterTickerService } from '../services/MasterTickerService.js';

const router = Router();

// ─── App Config ───────────────────────────────────────────────────────────────

// GET /api/config
router.get('/config', async (_req, res) => {
  try {
    const db = getDB();
    const rows = await dbAll(db, 'SELECT key, value FROM AppConfig');
    const config: Record<string, string> = {};
    rows.forEach((r: any) => { config[r.key] = r.value; });
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/config
router.post('/config', async (req, res) => {
  try {
    const db = getDB();
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'key is required.' });
    await dbRun(db, 'INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)', [key, String(value ?? '')]);
    res.json({ success: true, message: `Config "${key}" saved.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/config/bulk
router.post('/config/bulk', async (req, res) => {
  try {
    const db = getDB();
    const { config } = req.body;
    if (!config || typeof config !== 'object') return res.status(400).json({ success: false, error: 'config object required.' });
    for (const [key, value] of Object.entries(config)) {
      await dbRun(db, 'INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)', [key, String(value ?? '')]);
    }
    res.json({ success: true, message: `Saved ${Object.keys(config).length} config entries.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Family / Benchmark Hierarchy ─────────────────────────────────────────────

router.get('/family-hierarchy', async (_req, res) => {
  try {
    res.json(await FamilyBenchmarkService.getInstance().getFamilyHierarchy());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/family-hierarchy', async (req, res) => {
  try {
    res.json(await FamilyBenchmarkService.getInstance().saveFamilyGroup(req.body));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/family-hierarchy/:id', async (req, res) => {
  try {
    res.json(await FamilyBenchmarkService.getInstance().deleteFamilyGroup(parseInt(req.params.id, 10)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/family-hierarchy/assign', async (req, res) => {
  try {
    res.json(await FamilyBenchmarkService.getInstance().assignPortfolio(req.body));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Asset / Scrip Mappings ───────────────────────────────────────────────────

router.get('/scrip-mappings', async (req, res) => {
  try {
    const broker = req.query.broker as string;
    const query = req.query.query as string;
    res.json(await AssetScripMappingService.getInstance().getMappings({ broker, query }));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/scrip-mappings', async (req, res) => {
  try {
    res.json(await AssetScripMappingService.getInstance().saveMapping(req.body));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/scrip-mappings/:id', async (req, res) => {
  try {
    res.json(await AssetScripMappingService.getInstance().deleteMapping(parseInt(req.params.id, 10)));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/scrip-mappings/unmapped', async (_req, res) => {
  try {
    res.json(await AssetScripMappingService.getInstance().getUnmappedScrips());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/scrip-mappings/auto-resolve', async (_req, res) => {
  try {
    res.json(await AssetScripMappingService.getInstance().autoResolveUnmapped());
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Master Tickers ───────────────────────────────────────────────────────────

router.get('/tickers', async (req, res) => {
  try {
    const db = getDB();
    const search = req.query.search as string;
    let sql = 'SELECT * FROM MasterTickers';
    const params: any[] = [];
    if (search) {
      sql += ' WHERE symbol LIKE ? OR isin LIKE ? OR name LIKE ?';
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY symbol ASC LIMIT 500';
    const rows = await dbAll(db, sql, params);
    res.json({ success: true, tickers: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickers/sync', async (_req, res) => {
  try {
    const svc = MasterTickerService.getInstance();
    const initResult = await svc.autoInitializeMasterTickers();
    const syncResult = await svc.dailyCheckAndSyncMetadata();
    res.json({ success: true, seeded: initResult.seeded, synced: syncResult.synced, count: syncResult.count, message: syncResult.message });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickers/sync-sectors', async (_req, res) => {
  try {
    // Sector sync is handled as part of the Yahoo Finance metadata sync
    const svc = MasterTickerService.getInstance();
    const syncResult = await svc.dailyCheckAndSyncMetadata();
    res.json({ success: true, message: 'Sector sync triggered via metadata sync.', ...syncResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickers/merge', async (req, res) => {
  try {
    const db = getDB();
    const { source_id, target_id } = req.body;
    if (!source_id || !target_id || source_id === target_id) {
      return res.status(400).json({ success: false, error: 'Invalid source or target ID' });
    }
    const source: any = await dbGet(db, 'SELECT symbol, isin FROM MasterTickers WHERE id = ?', [source_id]);
    const target: any = await dbGet(db, 'SELECT symbol, isin FROM MasterTickers WHERE id = ?', [target_id]);
    if (!source || !target) return res.status(404).json({ success: false, error: 'Ticker not found' });

    // Remap all references from source to target
    await dbRun(db, 'UPDATE Transactions SET symbol=?, isin=? WHERE symbol=? OR isin=?', [target.symbol, target.isin, source.symbol, source.isin]);
    await dbRun(db, 'UPDATE Holdings SET symbol=?, isin=? WHERE symbol=? OR isin=?', [target.symbol, target.isin, source.symbol, source.isin]);
    await dbRun(db, 'DELETE FROM MasterTickers WHERE id = ?', [source_id]);
    res.json({ success: true, message: `Merged ${source.symbol} → ${target.symbol}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/tickers', async (req, res) => {
  try {
    const db = getDB();
    const { isin, symbol, name, exchange, segment, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    if (!isin || !symbol) return res.status(400).json({ success: false, error: 'isin and symbol are required.' });

    const result = await dbRun(db, `
      INSERT INTO MasterTickers (isin, symbol, name, exchange, segment, sector, last_price, fmv_31_jan_2018)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(isin) DO UPDATE SET
        symbol = excluded.symbol,
        name = COALESCE(excluded.name, MasterTickers.name),
        exchange = COALESCE(excluded.exchange, MasterTickers.exchange),
        segment = COALESCE(excluded.segment, MasterTickers.segment),
        sector = COALESCE(excluded.sector, MasterTickers.sector),
        last_price = COALESCE(excluded.last_price, MasterTickers.last_price),
        fmv_31_jan_2018 = COALESCE(excluded.fmv_31_jan_2018, MasterTickers.fmv_31_jan_2018)
    `, [isin, symbol, name || symbol, exchange || 'NSE', segment || 'EQ', sector || '', manual_ltp || null, fmv_31_jan_2018 || null]);

    res.json({ success: true, id: result.lastID, message: 'Ticker saved.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/tickers/:id', async (req, res) => {
  try {
    const db = getDB();
    const id = parseInt(req.params.id, 10);
    const { symbol, name, exchange, segment, sector, manual_ltp, fmv_31_jan_2018 } = req.body;
    await dbRun(db, `
      UPDATE MasterTickers SET
        symbol = COALESCE(?, symbol), name = COALESCE(?, name), exchange = COALESCE(?, exchange),
        segment = COALESCE(?, segment), sector = COALESCE(?, sector),
        last_price = COALESCE(?, last_price), fmv_31_jan_2018 = COALESCE(?, fmv_31_jan_2018),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [symbol, name, exchange, segment, sector, manual_ltp, fmv_31_jan_2018, id]);
    res.json({ success: true, message: 'Ticker updated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/tickers/:id', async (req, res) => {
  try {
    const db = getDB();
    await dbRun(db, 'DELETE FROM MasterTickers WHERE id = ?', [parseInt(req.params.id, 10)]);
    res.json({ success: true, message: 'Ticker deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/user-mappings
router.get('/user-mappings', async (_req, res) => {
  try {
    const db = getDB();
    const rows = await dbAll(db, 'SELECT * FROM UserMappings ORDER BY raw_name ASC');
    res.json({ success: true, mappings: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
