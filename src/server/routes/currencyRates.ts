/**
 * src/server/routes/currencyRates.ts
 * Currency Rates and Live XE Sync routes
 */
import { Router } from 'express';
import { BankAndFDService } from '../services/BankAndFDService.js';

const router = Router();

// GET /api/currency-rates
router.get('/', async (_req, res) => {
  try {
    const rates = await BankAndFDService.getInstance().getCurrencyRates();
    res.json({ success: true, rates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/currency-rates/sync
router.post('/sync', async (_req, res) => {
  try {
    const result = await BankAndFDService.getInstance().fetchLiveXERates();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
