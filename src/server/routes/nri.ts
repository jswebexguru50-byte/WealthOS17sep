import { Router, Request, Response } from 'express';
import { NriWealthService } from '../services/NriWealthService.js';
import { getDB } from '../database.js';
import { MiscRepository } from '../services/MiscRepository.js';

const router = Router();
const nriService = NriWealthService.getInstance();

/**
 * GET /api/nri/tds-recon
 * Capital Gains & Section 195 TDS Reconciliation
 */
router.get('/tds-recon', async (req: Request, res: Response) => {
  try {
    const fy = (req.query.financial_year as string) || (req.query.fy as string) || '2024-2025';
    const portfolio = req.query.portfolio as string;
    const result = await nriService.getTdsReconciliation(fy, portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/nri/repatriation
 * FEMA USD 1,000,000 Annual NRO Repatriation Quota
 */
router.get('/repatriation', async (req: Request, res: Response) => {
  try {
    const fy = (req.query.financial_year as string) || (req.query.fy as string) || '2024-2025';
    const portfolio = req.query.portfolio as string;
    const result = await nriService.getFemaRepatriationStatus(fy, portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/nri/repatriation/record
 * Record a new remittance transaction
 */
router.post('/repatriation/record', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const {
      financial_year,
      remittance_date,
      portfolio,
      source_account_nro,
      destination_country,
      remitted_amount_inr,
      fx_rate_usd_inr,
      remitted_amount_usd,
      form_15ca_ack_no,
      form_15cb_cert_no,
      ca_membership_no,
      purpose_code
    } = req.body;

    await MiscRepository.getInstance().insertFemaRepatriation(
      db,
      financial_year || '2024-2025',
      remittance_date || new Date().toISOString().split('T')[0],
      portfolio || 'Default',
      source_account_nro || 'NRO Savings',
      destination_country || 'UAE',
      remitted_amount_inr,
      fx_rate_usd_inr || 86.80,
      remitted_amount_usd,
      form_15ca_ack_no,
      form_15cb_cert_no,
      ca_membership_no,
      purpose_code || 'S1301'
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/nri/tax-harvesting
 * Tax-Loss Harvesting & Set-Off Candidates
 */
router.get('/tax-harvesting', async (req: Request, res: Response) => {
  try {
    const portfolio = req.query.portfolio as string;
    const result = await nriService.getTaxHarvestOpportunities(portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/nri/rebalance-matrix
 * Target Allocation & Drift Matrix
 */
router.get('/rebalance-matrix', async (req: Request, res: Response) => {
  try {
    const model = (req.query.model_name as string) || 'Balanced NRI Growth';
    const portfolio = req.query.portfolio as string;
    const result = await nriService.getRebalancingMatrix(model, portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/nri/switch-analysis
 * Switch Friction & Hurdle Rate Calculator
 */
router.post('/switch-analysis', (req: Request, res: Response) => {
  try {
    const result = nriService.calculateSwitchHurdle({
      source_asset: req.body.source_asset || 'Holding A',
      target_asset: req.body.target_asset || 'Holding B',
      current_valuation: Number(req.body.current_valuation) || 500000,
      embedded_gain_pct: Number(req.body.embedded_gain_pct) || 40,
      gain_type: req.body.gain_type === 'STCG' ? 'STCG' : 'LTCG',
      time_horizon_years: Number(req.body.time_horizon_years) || 3
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/nri/dual-currency-xirr
 * Dual-Currency XIRR & FX Return Drag
 */
router.get('/dual-currency-xirr', async (req: Request, res: Response) => {
  try {
    const baseCurrency = (req.query.base_currency as string) || (req.query.baseCurrency as string) || 'USD';
    const portfolio = (req.query.portfolio as string);
    const result = await nriService.getDualCurrencyXIRR(baseCurrency, portfolio);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/nri/account-profiles
 * List all Account Profiles (NRE/NRO/PIS/US)
 */
router.get('/account-profiles', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const profiles = await MiscRepository.getInstance().getAccountProfiles(db);
    res.json({ success: true, profiles });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/nri/account-profiles
 * Upsert Account Profile
 */
router.post('/account-profiles', async (req: Request, res: Response) => {
  try {
    const db = getDB();
    const {
      portfolio_name,
      account_type,
      demat_scheme,
      designated_bank,
      bank_account_number,
      pis_permission_ref,
      resident_country,
      tax_residency_status
    } = req.body;

    await MiscRepository.getInstance().upsertAccountProfile(
      db,
      portfolio_name,
      account_type || 'NRE',
      demat_scheme || 'NON_PIS',
      designated_bank,
      bank_account_number,
      pis_permission_ref,
      resident_country || 'UAE',
      tax_residency_status || 'NRI'
    );
    res.json({ success: true, message: 'Account profile updated' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
