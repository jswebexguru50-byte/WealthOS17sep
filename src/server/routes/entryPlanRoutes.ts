import { Router, Request, Response } from 'express';
import { EntryPlanOutcomeService } from '../services/EntryPlanOutcomeService.js';

export const entryPlanRouter = Router();

const svc = () => EntryPlanOutcomeService.getInstance();

// GET /api/entry-plans — list all entry plans (optional ?symbol=, ?strategy=, ?status=)
entryPlanRouter.get('/', (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const strategyId = req.query.strategy ? String(req.query.strategy) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const plans = svc().listPlans({ symbol, strategyId, status });
    res.json({ success: true, data: plans, count: plans.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/entry-plans/summary — returns getOutcomeSummary()
entryPlanRouter.get('/summary', (req: Request, res: Response) => {
  try {
    const strategyId = req.query.strategy ? String(req.query.strategy) : undefined;
    const summary = svc().getOutcomeSummary(strategyId);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/entry-plans — createPlan
entryPlanRouter.post('/', (req: Request, res: Response) => {
  try {
    const planId = svc().createPlan(req.body);
    res.status(201).json({ success: true, planId });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/entry-plans/:planId/entry — recordEntry
entryPlanRouter.patch('/:planId/entry', (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const { actualPrice, date, quantity } = req.body;

    if (actualPrice == null || !date || quantity == null) {
      res.status(400).json({ success: false, error: 'actualPrice, date, and quantity are required' });
      return;
    }

    svc().recordEntry(planId, Number(actualPrice), String(date), Number(quantity));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/entry-plans/:planId/exit — recordExit
entryPlanRouter.patch('/:planId/exit', (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const { exitType, actualPrice, date } = req.body;

    const validExitTypes = ['HIT_TARGET', 'HIT_STOP', 'MANUAL_EXIT'];
    if (!validExitTypes.includes(exitType)) {
      res.status(400).json({
        success: false,
        error: `exitType must be one of: ${validExitTypes.join(', ')}`,
      });
      return;
    }
    if (actualPrice == null || !date) {
      res.status(400).json({ success: false, error: 'actualPrice and date are required' });
      return;
    }

    svc().recordExit(planId, exitType, Number(actualPrice), String(date));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
