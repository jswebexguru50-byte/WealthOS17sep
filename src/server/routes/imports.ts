/**
 * src/server/routes/imports.ts
 * Import routes: PMS parsing, reconciliation, deduplication, template downloads, CAMS
 */
import { Router } from 'express';
import multer from 'multer';
import { MultiBrokerReconService } from '../services/MultiBrokerReconService.js';
import { TransactionDeduplicationService } from '../services/TransactionDeduplicationService.js';
import { parseIIFLBankBookCSV, parsePMSTradeRegisterCSV, parseCCBankBookCSV, parseCCBankBookFromPdfText, parseCCTradeRegisterFromPdfText } from '../pmsParser.js';
import { parseCamsStatement, fetchAMFINavs, fetchAMFISchemeCodes, fetchNAVFromMFapi, extractSummaryFromPdfText, extractTextFromPdf } from '../camsParser.js';
import { getDB, dbAll, dbGet, dbRun } from '../database.js';
import { runFIFO } from '../fifoEngine.js';

const router = Router();
const fileUpload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Template Downloads ───────────────────────────────────────────────────────

router.get('/templates/download/:templateId', (req, res) => {
  const { templateId } = req.params;
  const templates: Record<string, { filename: string; content: string }> = {
    'iifl-pms-bank-book': {
      filename: '360_ONE_IIFL_PMS_Bank_Book_Template.csv',
      content: `Date,Transaction Type,Particulars / Narration,Debit,Credit,Running Balance,Voucher No\n2024-04-05,Corpus Inflow,Initial Corpus Capital Received,,10000000.00,10000000.00,VCH-001\n2024-04-12,BUY,Bought 500 RELIANCE @ 2900,1450000.00,,8550000.00,VCH-002\n`
    },
    'iifl-pms-trades': {
      filename: '360_ONE_IIFL_PMS_Trade_Register_Template.csv',
      content: `Trade Date,Settlement Date,Security Name,ISIN,Symbol,Transaction Type,Quantity,Price,Gross Amount,Brokerage,STT,Net Amount\n2024-04-12,2024-04-13,Reliance Industries Ltd,INE002A01018,RELIANCE,BUY,500,2900.00,1450000.00,145.00,1450.00,1451595.00\n`
    },
    'complete-circle-pms-bank-book': {
      filename: 'Complete_Circle_PMS_Bank_Book_Template.csv',
      content: `Code,Name,Bank Account,Bank Name,Transaction Description,Tran Date,Set Date,Tran Account,Symbol Code,Security,Buy/Sell Amount,Income,Expenses,Dep/With,Balance,Custodian Account,Tran Ref,Desc/Notes,Account Code\nCC01,Complete Circle,12345678,HDFC Bank,Corpus Deposits,05/04/2024,05/04/2024,12345678,,,0,0,0,5000000.00,5000000.00,CUST01,REF001,Corpus Addition,ACC01\n`
    },
    'complete-circle-pms-trades': {
      filename: 'Complete_Circle_PMS_Trade_Register_Template.csv',
      content: `Trade Date,Security Name,ISIN,Symbol,Action,Quantity,Execution Rate,Total Value,Brokerage,STT,Net Consideration\n2024-04-12,Tata Consultancy Services Ltd,INE467B01029,TCS,BUY,250,4000.00,1000000.00,100.00,1000.00,1001100.00\n`
    }
  };

  const tmpl = templates[templateId] || templates['complete-circle-pms-trades'];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${tmpl.filename}"`);
  res.send(tmpl.content);
});

// ─── Multi-Broker Reconciliation ──────────────────────────────────────────────

router.post('/recon/multi-broker', fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No statement file uploaded.' });
    const result = await MultiBrokerReconService.getInstance().reconcileFileBuffer(
      req.file.buffer, req.file.originalname,
      req.body.portfolio || 'Combined', req.body.forcedFormat
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PMS File Parsing ─────────────────────────────────────────────────────────

router.post('/pms/iifl/parse', fileUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    const text = req.file.buffer.toString('utf-8');
    const statementType = req.body.type || 'BANK_BOOK';
    const records = statementType === 'BANK_BOOK'
      ? parseIIFLBankBookCSV(text)
      : parsePMSTradeRegisterCSV(text, '360_ONE');
    res.json({ success: true, count: records.length, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/pms/complete-circle/parse', fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    const buffer = req.file.buffer;
    const statementType = req.body.type || 'BANK_BOOK';
    const isPdf = buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;

    if (isPdf) {
      const pdfText = await extractTextFromPdf(buffer).catch((e: any) => {
        throw new Error(`PDF extraction failed: ${e.message}`);
      });
      if (!pdfText || pdfText.trim().length < 50) {
        return res.status(422).json({ success: false, error: 'PDF appears to be scanned (image-only). Please use a text-based PDF or CSV export.' });
      }
      const records = statementType === 'BANK_BOOK' ? parseCCBankBookFromPdfText(pdfText) : parseCCTradeRegisterFromPdfText(pdfText);
      res.json({ success: true, count: records.length, records, source: 'PDF' });
    } else {
      const text = buffer.toString('utf-8');
      const records = statementType === 'BANK_BOOK' ? parseCCBankBookCSV(text) : parsePMSTradeRegisterCSV(text, 'COMPLETE_CIRCLE');
      res.json({ success: true, count: records.length, records, source: 'CSV' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Deduplication ────────────────────────────────────────────────────────────

router.post('/transactions/deduplicate-check', async (req, res) => {
  try {
    const { portfolio, transactions } = req.body;
    if (!Array.isArray(transactions)) return res.status(400).json({ success: false, error: 'Invalid transactions array.' });
    const analysis = await TransactionDeduplicationService.getInstance().analyzeDuplicates(portfolio || 'Combined', transactions);
    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/transactions/deduplicate-commit', async (req, res) => {
  try {
    const { portfolio, transactions, strategy } = req.body;
    if (!Array.isArray(transactions)) return res.status(400).json({ success: false, error: 'Invalid transactions array.' });
    const result = await TransactionDeduplicationService.getInstance().commitDeduplicatedTransactions(
      portfolio || 'Combined', transactions, strategy || 'SKIP_DUPLICATES'
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── CAMS / Mutual Fund Import ────────────────────────────────────────────────

router.get('/cams/configurations', async (_req, res) => {
  try {
    const db = getDB();
    res.json({ success: true, configurations: await dbAll(db, 'SELECT * FROM CamsConfigurations ORDER BY pan ASC') });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cams/configurations', async (req, res) => {
  try {
    const db = getDB();
    const { pan, email, password, portfolio_name } = req.body;
    if (!pan || !email || !portfolio_name) return res.status(400).json({ success: false, error: 'PAN, email, and portfolio_name are required.' });
    await dbRun(db, `INSERT INTO CamsConfigurations (pan, email, password, portfolio_name, status) VALUES (?, ?, ?, ?, 'ACTIVE')
      ON CONFLICT(pan) DO UPDATE SET email=excluded.email, password=COALESCE(excluded.password, CamsConfigurations.password), portfolio_name=excluded.portfolio_name`,
      [pan.toUpperCase(), email, password || null, portfolio_name]);
    res.json({ success: true, message: 'CAMS configuration saved.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/cams/configurations/:pan', async (req, res) => {
  try {
    const db = getDB();
    await dbRun(db, 'DELETE FROM CamsConfigurations WHERE pan = ?', [req.params.pan.toUpperCase()]);
    res.json({ success: true, message: 'CAMS configuration deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cams/amfi-navs', async (req, res) => {
  try {
    const isin = req.query.isin as string;
    const navMap = await fetchAMFINavs();
    const nav = isin ? navMap.get(isin.toUpperCase()) ?? null : null;
    res.json({ success: true, navs: nav !== null ? [{ isin, nav }] : [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cams/mf-nav', async (req, res) => {
  try {
    const scheme_code = req.query.scheme_code as string;
    const isin = (req.query.isin as string) || scheme_code;
    const symbol = (req.query.symbol as string) || '';
    if (!scheme_code && !isin) return res.status(400).json({ success: false, error: 'scheme_code or isin is required.' });
    const nav = await fetchNAVFromMFapi(isin, symbol);
    res.json({ success: true, nav });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
