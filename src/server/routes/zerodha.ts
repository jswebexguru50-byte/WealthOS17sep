/**
 * src/server/routes/zerodha.ts
 * Zerodha Kite Direct API, Auto-Detection & Historical Tradebook Routes
 */
import { Router } from 'express';
import multer from 'multer';
import { ZerodhaSyncService } from '../services/ZerodhaSyncService.js';
import { ZerodhaTradebookService } from '../services/ZerodhaTradebookService.js';

const router = Router();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/zerodha/auto-detect
// Automatically detects active Zerodha Kite session & enctoken from the user's browser tab
router.get('/auto-detect', async (req, res) => {
  try {
    const svc = ZerodhaSyncService.getInstance();
    const result = await svc.autoDetectSessionFromBrowser();
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha auto-detect error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/auto-sync
// 1-Click: Automatically reads token from the browser tab and syncs holdings directly
router.post('/auto-sync', async (req, res) => {
  try {
    const { portfolio = 'Self' } = req.body;
    const svc = ZerodhaSyncService.getInstance();

    const session = await svc.autoDetectSessionFromBrowser();
    if (!session.success || !session.enctoken) {
      return res.status(400).json({
        success: false,
        error: session.error || 'Failed to detect active Zerodha session from browser. Please ensure kite.zerodha.com is open and logged in.'
      });
    }

    const result = await svc.syncHoldings(session.enctoken, 'ENCTOKEN', portfolio);
    res.json({
      ...result,
      detectedUser: session.user_id,
      autoDetected: true
    });
  } catch (err: any) {
    console.error('Zerodha auto-sync error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET or POST /api/zerodha/push-session
// Receives session pushed via Bookmarklet, Extension, Console Snippet, or Image Beacon from kite.zerodha.com
router.all('/push-session', (req, res) => {
  try {
    const token = (req.body?.token || req.query?.token || '') as string;
    const user_id = (req.body?.user_id || req.query?.user_id || '') as string;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    ZerodhaSyncService.getInstance().setSession(token, user_id);
    res.json({
      success: true,
      message: `Zerodha session successfully linked to NRI WealthOS for user: ${user_id || 'Active User'}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/launch-browser
// Launches a connected Chrome / Edge window with remote debugging pointing to kite.zerodha.com
router.post('/launch-browser', async (req, res) => {
  try {
    const svc = ZerodhaSyncService.getInstance();
    const result = await svc.launchConnectedBrowser();
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha launch-browser error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/zerodha/clear-session
// Clears currently stored Zerodha session
router.post('/clear-session', (req, res) => {
  try {
    ZerodhaSyncService.getInstance().clearSession();
    res.json({ success: true, message: 'Zerodha session cleared.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/sync
// Manual or token-based holdings sync
router.post('/sync', async (req, res) => {
  try {
    const { token, tokenType = 'ENCTOKEN', portfolio = 'Self', apiKey } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token (enctoken or Kite Connect token) is required.' });
    }

    const svc = ZerodhaSyncService.getInstance();
    const result = await svc.syncHoldings(token, tokenType, portfolio, apiKey);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err: any) {
    console.error('Zerodha sync route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/tradebook/validate
// Uploads and parses Zerodha Console Tradebook (XLSX / CSV)
router.post('/tradebook/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const targetPortfolio = req.body.portfolio || '';
    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.validateTradebook(req.file.buffer, req.file.originalname, targetPortfolio);

    res.json(result);
  } catch (err: any) {
    console.error('Zerodha tradebook validate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/tradebook/commit
// Commits parsed historical trades into Transactions and triggers FIFO recalculation
router.post('/tradebook/commit', async (req, res) => {
  try {
    const { batchId, portfolio } = req.body;
    if (!batchId) {
      return res.status(400).json({ success: false, error: 'batchId is required' });
    }
    if (!portfolio) {
      return res.status(400).json({ success: false, error: 'Target portfolio is required' });
    }

    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.commitTradebook(batchId, portfolio);

    res.json(result);
  } catch (err: any) {
    console.error('Zerodha tradebook commit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zerodha/tradebook/downloads-summary
// Returns quick count of tradebook files in user's Downloads folder
router.get('/tradebook/downloads-summary', (req, res) => {
  try {
    const svc = ZerodhaTradebookService.getInstance();
    const summary = svc.getDownloadsSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/tradebook/scan-downloads
// Scans Downloads folder, audits for missing trades, and optionally ingests them
router.post('/tradebook/scan-downloads', async (req, res) => {
  try {
    const { previewOnly = false } = req.body || {};
    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.scanAndIngestDownloadsFolder(undefined, previewOnly);
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha scan-downloads error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zerodha/tradebook/checkpoint
// Returns incremental sync date range and checkpoint details
router.get('/tradebook/checkpoint', async (req, res) => {
  try {
    const portfolio = String(req.query.portfolio || 'Papa');
    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.getSyncCheckpoint(portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Zerodha checkpoint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/tradebook/auto-download
// Automated Playwright workflow to download from Zerodha Console
router.post('/tradebook/auto-download', async (req, res) => {
  try {
    const { headless = false, portfolio, fromDate, toDate, forceFull = false } = req.body || {};
    const { ZerodhaConsoleDownloader } = await import('../services/ZerodhaConsoleDownloader.js');
    const downloader = ZerodhaConsoleDownloader.getInstance();
    const result = await downloader.autoDownloadAndSync({
      headless,
      portfolio,
      fromDate,
      toDate,
      forceFull
    });
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha auto-download error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zerodha/reconciliation
// Reconciles API imported Demat holdings vs Script/FIFO trade ledger holdings
router.get('/reconciliation', async (req, res) => {
  try {
    const portfolio = String(req.query.portfolio || 'Maa');
    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.getReconciliationReport(portfolio);
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha reconciliation route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/zerodha/console-reconciliation
// Full bidirectional reconciliation with Zerodha Console Holdings (PSI722) and Reports Tradebook files
router.get('/console-reconciliation', async (req, res) => {
  try {
    const portfolio = String(req.query.portfolio || 'Maa');
    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.getConsoleAndTradebookReconReport(portfolio);
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha console-reconciliation route error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/reconciliation/approve-exception
// User approves a reconciliation discrepancy with audit reasoning
router.post('/reconciliation/approve-exception', async (req, res) => {
  try {
    const { portfolio, scripOrTradeId, exceptionType, discrepancyDetail, reasonCategory, reasonNotes } = req.body;
    if (!portfolio || !scripOrTradeId || !reasonCategory) {
      return res.status(400).json({ success: false, error: 'portfolio, scripOrTradeId, and reasonCategory are required' });
    }

    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.approveException({
      portfolio,
      scripOrTradeId,
      exceptionType,
      discrepancyDetail,
      reasonCategory,
      reasonNotes
    });
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha approve-exception error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/zerodha/reconciliation/revoke-exception
// Revokes an approved exception
router.post('/reconciliation/revoke-exception', async (req, res) => {
  try {
    const { exceptionId } = req.body;
    if (!exceptionId) {
      return res.status(400).json({ success: false, error: 'exceptionId is required' });
    }

    const svc = ZerodhaTradebookService.getInstance();
    const result = await svc.revokeException(Number(exceptionId));
    res.json(result);
  } catch (err: any) {
    console.error('Zerodha revoke-exception error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
