/**
 * src/server/routes/reports.ts
 * Institutional Reports Engine routes
 */
import { Router } from 'express';
import { ReportsService } from '../services/ReportsService.js';

const router = Router();

const REPORT_TYPES = new Set([
  'CAPITAL_GAINS', 'TRADE_BOOK', 'DIVIDEND_INCOME', 'DIVIDEND_STATEMENT',
  'ASSET_XIRR', 'ASSET_ALLOCATION', 'PERFORMANCE_SUMMARY', 'HOLDING_STATEMENT'
]);
const isIsoDate = (value: unknown): boolean => value == null || value === '' ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));

router.get('/catalog', (_req, res) => {
  res.json({ success: true, reports: Array.from(REPORT_TYPES).map(reportType => ({ reportType })) });
});

// POST /api/reports/generate
router.post('/generate', async (req, res) => {
  try {
    const { reportType, portfolio, financialYear, startDate, endDate, assetClass, includeGrandfathering } = req.body;
    const normalizedType = String(reportType || 'HOLDING_STATEMENT').toUpperCase();
    if (!REPORT_TYPES.has(normalizedType)) {
      return res.status(400).json({ success: false, error: 'INVALID_REPORT_TYPE' });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return res.status(400).json({ success: false, error: 'INVALID_TRADE_DATE' });
    }
    const svc = ReportsService.getInstance();
    let data: any;

    switch (normalizedType) {
      case 'CAPITAL_GAINS':
        data = await svc.generateCapitalGainsReport({ reportType: normalizedType, portfolio, financialYear, startDate, endDate, includeGrandfathering });
        break;
      case 'TRADE_BOOK':
        data = await svc.generateTradeBook({ reportType: normalizedType, portfolio, financialYear, startDate, endDate });
        break;
      case 'DIVIDEND_INCOME':
      case 'DIVIDEND_STATEMENT':
        data = await svc.generateDividendReport({ reportType: 'DIVIDEND_STATEMENT', portfolio, financialYear, startDate, endDate });
        break;
      case 'ASSET_XIRR':
        data = await svc.generateAssetWiseXirrReport({ reportType: 'ASSET_XIRR', portfolio, financialYear, startDate, endDate });
        break;
      case 'ASSET_ALLOCATION':
      case 'PERFORMANCE_SUMMARY':
        data = await svc.generateAssetAllocationReport({ reportType: 'PERFORMANCE_SUMMARY', portfolio, financialYear, startDate, endDate });
        break;
      default:
        data = await svc.generateHoldingsStatement({ reportType: 'HOLDING_STATEMENT', portfolio, assetClass });
    }

    res.json(data);
  } catch (err: any) {
    console.error('Reports generation failed:', err);
    const status = String(err?.message || '').startsWith('INVALID_FINANCIAL_YEAR') ||
      String(err?.message || '').startsWith('INVALID_TRADE_DATE') ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

export default router;

