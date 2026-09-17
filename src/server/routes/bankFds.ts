/**
 * src/server/routes/bankFds.ts
 * Bank Accounts, Fixed Deposits and Currency Rates routes
 */
import { Router } from 'express';
import { BankAndFDService } from '../services/BankAndFDService.js';

const router = Router();

// GET /api/bank-fds
router.get('/', async (req, res) => {
  try {
    const portfolio = req.query.portfolio as string;
    const svc = BankAndFDService.getInstance();
    const items = await svc.getAllBankAndFDs(portfolio);
    const fxRates = await svc.getCurrencyRates();

    let totalInrValuation = 0;
    const itemsWithInr = items.map((item: any) => {
      const rate = fxRates[item.currency?.toUpperCase()] || 1.0;
      const inrValue = (item.balance_amount || 0) * rate;
      totalInrValuation += inrValue;
      return { ...item, rate_to_inr: rate, inr_value: Math.round(inrValue * 100) / 100 };
    });

    res.json({
      success: true,
      data: itemsWithInr,
      total_inr_valuation: Math.round(totalInrValuation * 100) / 100,
      currency_rates: fxRates
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bank-fds
router.post('/', async (req, res) => {
  try {
    const result = await BankAndFDService.getInstance().saveBankOrFD(req.body);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/bank-fds/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await BankAndFDService.getInstance().deleteBankOrFD(id);
    res.json({ success: true, message: 'Deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/currency-rates
router.get('/currency-rates', async (_req, res) => {
  try {
    const rates = await BankAndFDService.getInstance().getCurrencyRates();
    res.json({ success: true, rates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/currency-rates/sync
router.post('/currency-rates/sync', async (_req, res) => {
  try {
    const result = await BankAndFDService.getInstance().fetchLiveXERates();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
