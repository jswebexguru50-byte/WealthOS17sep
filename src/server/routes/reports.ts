/**
 * src/server/routes/reports.ts
 * Institutional Reports Engine routes
 */
import { Router } from 'express';
import { ReportsService } from '../services/ReportsService.js';

const router = Router();

// POST /api/reports/generate
router.post('/generate', async (req, res) => {
  try {
    const { reportType, portfolio, financialYear, startDate, endDate, assetClass, includeGrandfathering } = req.body;
    const svc = ReportsService.getInstance();
    let data: any;

    switch (reportType) {
      case 'CAPITAL_GAINS':
        data = await svc.generateCapitalGainsReport({ reportType, portfolio, financialYear, startDate, endDate, includeGrandfathering });
        break;
      case 'TRADE_BOOK':
        data = await svc.generateTradeBook({ reportType, portfolio, financialYear, startDate, endDate });
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
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
