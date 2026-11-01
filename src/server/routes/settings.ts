/**
 * src/server/routes/settings.ts
 * App config, family benchmark, scrip mappings, master tickers, preferences
 */
import { Router } from 'express';
import { getDB } from '../database.js';
import { FamilyBenchmarkService } from '../services/FamilyBenchmarkService.js';
import { AssetScripMappingService } from '../services/AssetScripMappingService.js';
import { MasterTickerService } from '../services/MasterTickerService.js';
import { SettingsRepository } from '../services/SettingsRepository.js';

const router = Router();

// ─── App Config ───────────────────────────────────────────────────────────────

// GET /api/config
router.get('/config', async (_req, res) => {
  try {
    const db = getDB();
    const rows = await SettingsRepository.getInstance().getAllConfig(db);
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
    await SettingsRepository.getInstance().upsertConfig(db, key, String(value ?? ''));
    res.json({ success: true, message: `Config "${key}" saved.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/config/bulk
router.post('/config/bulk', async (req, res) => {
  try {
    const db = getDB();
    const repo = SettingsRepository.getInstance();
    const { config } = req.body;
    if (!config || typeof config !== 'object') return res.status(400).json({ success: false, error: 'config object required.' });
    for (const [key, value] of Object.entries(config)) {
      await repo.upsertConfig(db, key, String(value ?? ''));
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
    const rows = await SettingsRepository.getInstance().getTickers(db, search);
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
    const repo = SettingsRepository.getInstance();
    const { source_id, target_id } = req.body;
    if (!source_id || !target_id || source_id === target_id) {
      return res.status(400).json({ success: false, error: 'Invalid source or target ID' });
    }
    const source: any = await repo.findTickerById(db, source_id);
    const target: any = await repo.findTickerById(db, target_id);
    if (!source || !target) return res.status(404).json({ success: false, error: 'Ticker not found' });

    // Remap all references from source to target
    await repo.remapTransactionsToTicker(db, target.symbol, target.isin, source.symbol, source.isin);
    await repo.remapHoldingsToTicker(db, target.symbol, target.isin, source.symbol, source.isin);
    await repo.deleteTicker(db, source_id);
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

    const result = await SettingsRepository.getInstance().upsertTicker(db, { isin, symbol, name, exchange, segment, sector, manual_ltp, fmv_31_jan_2018 });

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
    await SettingsRepository.getInstance().updateTicker(db, id, { symbol, name, exchange, segment, sector, manual_ltp, fmv_31_jan_2018 });
    res.json({ success: true, message: 'Ticker updated.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/tickers/:id', async (req, res) => {
  try {
    const db = getDB();
    await SettingsRepository.getInstance().deleteTicker(db, parseInt(req.params.id, 10));
    res.json({ success: true, message: 'Ticker deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/user-mappings
router.get('/user-mappings', async (_req, res) => {
  try {
    const db = getDB();
    const rows = await SettingsRepository.getInstance().getUserMappings(db);
    res.json({ success: true, mappings: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
