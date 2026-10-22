/**
 * src/server/routes/portfolios.ts
 * Portfolio CRUD, rename, type, currency, deletion, archiving
 */
import { Router } from 'express';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { runFIFO } from '../fifoEngine.js';

const router = Router();

// GET /api/portfolios
router.get('/', async (req, res) => {
  try {
    const db = getDB();
    const memberIdRaw = req.query.member_id || req.headers['x-member-id'];
    let memberId: number | null = null;
    if (memberIdRaw && memberIdRaw !== 'all' && memberIdRaw !== 'consolidated') {
      const parsed = parseInt(String(memberIdRaw), 10);
      if (!isNaN(parsed) && parsed > 0) memberId = parsed;
    }

    let rows: any[] = [];
    if (memberId) {
      rows = await dbAll(db, `
        SELECT DISTINCT p.name AS portfolio
        FROM Portfolios p
        WHERE (p.member_id = ? OR p.name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?))
          AND p.status = 'ACTIVE'
        ORDER BY p.name ASC
      `, [memberId, memberId]);
    } else {
      rows = await dbAll(db, `
        WITH PortfolioNames AS (
          SELECT DISTINCT portfolio FROM (
            SELECT portfolio FROM Transactions WHERE portfolio IS NOT NULL AND portfolio != ''
            UNION
            SELECT portfolio FROM Holdings WHERE portfolio IS NOT NULL AND portfolio != ''
            UNION
            SELECT portfolio FROM ZerodhaHoldings WHERE portfolio IS NOT NULL AND portfolio != ''
            UNION
            SELECT portfolio_name AS portfolio FROM CamsConfigurations WHERE portfolio_name IS NOT NULL AND portfolio_name != ''
            UNION
            SELECT name AS portfolio FROM Portfolios WHERE name IS NOT NULL AND name != '' AND status = 'ACTIVE'
          )
        ),
        PortfolioData AS (
          SELECT 
            PN.portfolio,
            P.base_currency,
            (SELECT SUM(current_value) FROM Holdings H WHERE H.portfolio = PN.portfolio) AS total_value
          FROM PortfolioNames PN
          LEFT JOIN Portfolios P ON PN.portfolio = P.name
        )
        SELECT portfolio
        FROM PortfolioData
        ORDER BY 
          CASE WHEN COALESCE(base_currency, 'INR') = 'INR' THEN 0 ELSE 1 END ASC,
          COALESCE(total_value, 0) DESC,
          portfolio ASC
      `);
    }

    const list = rows.map((r: any) => r.portfolio);

    let detailedPortfolios: any[] = [];
    try {
      if (memberId) {
        detailedPortfolios = await dbAll(db, "SELECT * FROM Portfolios WHERE (member_id = ? OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?)) AND status = 'ACTIVE' ORDER BY name ASC", [memberId, memberId]);
      } else {
        detailedPortfolios = await dbAll(db, 'SELECT * FROM Portfolios ORDER BY name ASC');
      }
    } catch {}

    const pmsQuery = memberId
      ? `SELECT name AS portfolio FROM Portfolios WHERE type = 'PMS' AND status = 'ACTIVE' AND (member_id = ? OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?))`
      : `SELECT name AS portfolio FROM Portfolios WHERE type = 'PMS' AND status = 'ACTIVE'`;
    const pmsParams = memberId ? [memberId, memberId] : [];
    const pmsRows = await dbAll(db, pmsQuery, pmsParams);
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
    const { name, type, base_currency } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Portfolio name is required.' });

    const trimmedName = name.trim();
    const portfolioType = type || 'EQUITY';
    const currency = base_currency || 'INR';

    const existing = await dbGet(db, 'SELECT id FROM Portfolios WHERE name = ?', [trimmedName]);
    if (existing) return res.status(400).json({ success: false, message: `Portfolio "${trimmedName}" already exists.` });

    await dbRun(db, `INSERT INTO Portfolios (name, type, base_currency, status) VALUES (?, ?, ?, 'ACTIVE')`, [trimmedName, portfolioType, currency]);
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
    const portfolioName = decodeURIComponent(req.params.name);
    const { type } = req.body;
    if (!type) return res.status(400).json({ success: false, message: 'Type is required.' });

    const existing = await dbGet(db, 'SELECT id FROM Portfolios WHERE name = ?', [portfolioName]);
    if (!existing) {
      await dbRun(db, `INSERT INTO Portfolios (name, type, status) VALUES (?, ?, 'ACTIVE')`, [portfolioName, type]);
    } else {
      await dbRun(db, 'UPDATE Portfolios SET type = ? WHERE name = ?', [type, portfolioName]);
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
    const portfolioName = decodeURIComponent(req.params.name);
    const { base_currency } = req.body;
    if (!base_currency) return res.status(400).json({ success: false, message: 'base_currency is required.' });

    const existing = await dbGet(db, 'SELECT id FROM Portfolios WHERE name = ?', [portfolioName]);
    if (!existing) {
      await dbRun(db, `INSERT INTO Portfolios (name, type, base_currency, status) VALUES (?, 'EQUITY', ?, 'ACTIVE')`, [portfolioName, base_currency]);
    } else {
      await dbRun(db, 'UPDATE Portfolios SET base_currency = ? WHERE name = ?', [base_currency, portfolioName]);
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
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ success: false, message: 'oldName and newName are required.' });

  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();

  try {
    await dbRun(db, 'BEGIN TRANSACTION');
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
        await dbRun(db, `UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [trimmedNew, trimmedOld]).catch(() => {});
      }
      await dbRun(db, 'UPDATE Portfolios SET name = ? WHERE name = ?', [trimmedNew, trimmedOld]);
      await dbRun(db, 'COMMIT');
      console.log(`[Portfolio] Renamed "${trimmedOld}" to "${trimmedNew}"`);
      res.json({ success: true, message: `Portfolio renamed from "${trimmedOld}" to "${trimmedNew}".` });
    } catch (err: any) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
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
    const portfolioName = decodeURIComponent(req.params.name);
    const { confirm } = req.body;
    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({ success: false, message: 'Confirmation required to delete portfolio.' });
    }

    // Delete all associated data in the correct order
    await dbRun(db, 'DELETE FROM Holdings WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM RealizedGains WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM TaxSummary WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM PortfolioHistory WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM BenchmarkCashFlowCache WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM CorporateActionAudit WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM BackupManualTransactions WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM Transactions WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM CamsConfigurations WHERE portfolio_name = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM ZerodhaHoldings WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, 'DELETE FROM PmsFeeConfigurations WHERE portfolio = ?', [portfolioName]);
    await dbRun(db, `UPDATE Portfolios SET status = 'ARCHIVED' WHERE name = ?`, [portfolioName]);

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
    const portfolioName = decodeURIComponent(req.params.name);
    await dbRun(db, `UPDATE Portfolios SET status = 'ARCHIVED' WHERE name = ?`, [portfolioName]);
    res.json({ success: true, message: `Portfolio "${portfolioName}" archived.` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
