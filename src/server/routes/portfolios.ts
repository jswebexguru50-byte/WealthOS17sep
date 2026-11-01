/**
 * src/server/routes/portfolios.ts
 * Portfolio CRUD, rename, type, currency, deletion, archiving
 */
import { Router } from 'express';
import { getDB } from '../database.js';
import { runFIFO } from '../fifoEngine.js';
import { PortfolioRepository } from '../services/PortfolioRepository.js';

const router = Router();

// GET /api/portfolios
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const memberIdRaw = req.query.member_id || req.headers['x-member-id'];
    let memberId: number | null = null;
    if (memberIdRaw && memberIdRaw !== 'all' && memberIdRaw !== 'consolidated') {
      const parsed = parseInt(String(memberIdRaw), 10);
      if (!isNaN(parsed) && parsed > 0) memberId = parsed;
    }

    let rows: any[] = [];
    if (memberId) {
      rows = await repo.getByMemberId(db, memberId);
    } else {
      rows = await repo.getAllRanked(db);
    }

    const list = rows.map((r: any) => r.portfolio);

    let detailedPortfolios: any[] = [];
    try {
      if (memberId) {
        detailedPortfolios = await repo.getDetailedByMemberId(db, memberId);
      } else {
        detailedPortfolios = await repo.getAllDetailed(db);
      }
    } catch {}

    const pmsRows = memberId
      ? await repo.getPmsByMemberId(db, memberId)
      : await repo.getPmsAll(db);
    const pmsPortfolios = pmsRows.map((r: any) => r.portfolio);

    res.json({ success: true, portfolios: list, list, detailedPortfolios, pmsPortfolios });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, portfolios: [] });
  }
});

// POST /api/portfolios — Create portfolio
router.post('/', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const { name, type, base_currency } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Portfolio name is required.' });

    const trimmedName = name.trim();
    const portfolioType = type || 'EQUITY';
    const currency = base_currency || 'INR';

    const existing = await repo.findByName(db, trimmedName);
    if (existing) return res.status(400).json({ success: false, message: `Portfolio "${trimmedName}" already exists.` });

    await repo.create(db, trimmedName, portfolioType, currency);
    console.log(`[Portfolio] Created: ${trimmedName} (${portfolioType}, ${currency})`);
    res.json({ success: true, message: `Portfolio "${trimmedName}" created successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/portfolios/:name/type
router.put('/:name/type', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const portfolioName = decodeURIComponent(req.params.name);
    const { type } = req.body;
    if (!type) return res.status(400).json({ success: false, message: 'Type is required.' });

    const existing = await repo.findByName(db, portfolioName);
    if (!existing) {
      await repo.insertWithType(db, portfolioName, type);
    } else {
      await repo.updateType(db, portfolioName, type);
    }
    console.log(`[Portfolio] Updated type for "${portfolioName}" to "${type}"`);
    res.json({ success: true, message: `Portfolio type updated to "${type}".` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/portfolios/:name/currency
router.put('/:name/currency', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const portfolioName = decodeURIComponent(req.params.name);
    const { base_currency } = req.body;
    if (!base_currency) return res.status(400).json({ success: false, message: 'base_currency is required.' });

    const existing = await repo.findByName(db, portfolioName);
    if (!existing) {
      await repo.insertWithCurrency(db, portfolioName, base_currency);
    } else {
      await repo.updateCurrency(db, portfolioName, base_currency);
    }
    console.log(`[Portfolio] Updated currency for "${portfolioName}" to "${base_currency}"`);
    res.json({ success: true, message: `Portfolio base currency updated to "${base_currency}".` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/portfolios/rename
router.put('/rename', async (req, res) => {
  const db = getDB();
  const repo = PortfolioRepository.getInstance();
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ success: false, message: 'oldName and newName are required.' });

  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();

  try {
    await repo.beginTransaction(db);
    try {
      const tables = [
        ['CamsConfigurations', 'portfolio_name'],
        ['Transactions', 'portfolio'],
        ['Holdings', 'portfolio'],
        ['ZerodhaHoldings', 'portfolio'],
        ['RealizedGains', 'portfolio'],
        ['TaxSummary', 'portfolio'],
        ['PortfolioHistory', 'portfolio'],
        ['BenchmarkCashFlowCache', 'portfolio'],
      ];
      for (const [table, col] of tables) {
        await repo.renameInTable(db, table, col, trimmedNew, trimmedOld);
      }
      await repo.renamePortfolio(db, trimmedNew, trimmedOld);
      await repo.commit(db);
      console.log(`[Portfolio] Renamed "${trimmedOld}" to "${trimmedNew}"`);
      res.json({ success: true, message: `Portfolio renamed from "${trimmedOld}" to "${trimmedNew}".` });
    } catch (err: any) {
      await repo.rollback(db);
      res.status(500).json({ success: false, message: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/portfolios/:name
router.delete('/:name', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const portfolioName = decodeURIComponent(req.params.name);
    const { confirm } = req.body;
    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({ success: false, message: 'Confirmation required to delete portfolio.' });
    }

    // Delete all associated data in the correct order
    await repo.deleteFromTable(db, 'Holdings', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'RealizedGains', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'TaxSummary', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'PortfolioHistory', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'BenchmarkCashFlowCache', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'CorporateActionAudit', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'BackupManualTransactions', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'Transactions', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'CamsConfigurations', 'portfolio_name', portfolioName);
    await repo.deleteFromTable(db, 'ZerodhaHoldings', 'portfolio', portfolioName);
    await repo.deleteFromTable(db, 'PmsFeeConfigurations', 'portfolio', portfolioName);
    await repo.archive(db, portfolioName);

    console.log(`[Portfolio] Deleted all data for: ${portfolioName}`);
    res.json({ success: true, message: `Portfolio "${portfolioName}" and all associated data deleted.` });
  } catch (err: any) {
    console.error('Error deleting portfolio:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/portfolios/:name/archive
router.post('/:name/archive', async (req, res) => {
  try {
    const db = getDB();
    const repo = PortfolioRepository.getInstance();
    const portfolioName = decodeURIComponent(req.params.name);
    await repo.archive(db, portfolioName);
    res.json({ success: true, message: `Portfolio "${portfolioName}" archived.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
