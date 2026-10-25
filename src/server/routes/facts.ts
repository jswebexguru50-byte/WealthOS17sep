import { Router } from 'express';
import { UnifiedDataResolver } from '../services/UnifiedDataResolver.js';
import { ok, err } from '../types/ApiContract.js';

const router = Router();
const resolver = UnifiedDataResolver.getInstance();

// GET /api/v2/facts/ticker/:symbol
router.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await resolver.getTicker(symbol);
    if (!data) return res.status(404).json(err(`Ticker ${symbol} not found`, 'FactsRepository'));
    res.json(ok(data, { source: 'FactsRepository', cached: true }));
  } catch (e: any) {
    res.status(500).json(err(e.message, 'facts'));
  }
});

// GET /api/v2/facts/fundamentals/:symbol
router.get('/fundamentals/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await resolver.getFundamentals(symbol);
    if (!data) return res.status(404).json(err(`Fundamentals for ${symbol} not found`, 'BatchFundamentalProvider'));
    res.json(ok(data, { source: 'BatchFundamentalProvider', cached: false }));
  } catch (e: any) {
    res.status(500).json(err(e.message, 'facts'));
  }
});

// GET /api/v2/facts/holdings?portfolio=X
router.get('/holdings', async (req, res) => {
  try {
    const portfolio = req.query.portfolio as string | undefined;
    const data = await resolver.getHoldings(portfolio);
    res.json(ok(data, { source: 'FactsRepository', cached: true }));
  } catch (e: any) {
    res.status(500).json(err(e.message, 'facts'));
  }
});

// GET /api/v2/facts/universe
router.get('/universe', async (_req, res) => {
  try {
    const data = await resolver.getEquityUniverse();
    res.json(ok(data, { source: 'FactsRepository', cached: true }));
  } catch (e: any) {
    res.status(500).json(err(e.message, 'facts'));
  }
});

// GET /api/v2/facts/strategies
router.get('/strategies', async (_req, res) => {
  try {
    const data = await resolver.getActiveStrategies();
    res.json(ok(data, { source: 'FactsRepository', cached: true }));
  } catch (e: any) {
    res.status(500).json(err(e.message, 'facts'));
  }
});

export default router;
