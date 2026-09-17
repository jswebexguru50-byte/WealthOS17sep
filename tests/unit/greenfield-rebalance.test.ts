import { describe, it, expect, beforeAll } from 'vitest';
import { GreenfieldRebalanceService } from '../../src/server/services/GreenfieldRebalanceService.js';

describe('Greenfield Portfolio Rebalancing & Capital Redeployment Engine', () => {
  let rebalanceService: GreenfieldRebalanceService;
  let sharedReport: any;

  beforeAll(async () => {
    rebalanceService = GreenfieldRebalanceService.getInstance();
    sharedReport = await rebalanceService.generateRebalanceReport('ALL');
  }, 60000);

  it('retrieves singleton instance of GreenfieldRebalanceService', () => {
    expect(rebalanceService).toBeDefined();
    const instance2 = GreenfieldRebalanceService.getInstance();
    expect(instance2).toBe(rebalanceService);
  });

  it('generates a comprehensive rebalance report across family portfolios', () => {
    const report = sharedReport;

    expect(report).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(report.portfolioFilter).toBe('ALL');

    // Verify summary metrics
    expect(report.summary).toBeDefined();
    expect(report.summary.totalTrappedInLaggardsInr).toBeGreaterThan(0);
    expect(report.summary.totalOverconcentratedCapitalInr).toBeGreaterThan(0);
    expect(report.summary.totalPotentialTaxSavingsInr).toBeGreaterThan(0);
    expect(report.summary.totalCapitalDeployableInr).toBeGreaterThan(0);
    expect(report.summary.projected12MonthAlphaUpliftInr).toBeGreaterThan(0);
    expect(report.summary.avgAlphaUpliftPct).toBeGreaterThan(20);
    expect(report.summary.laggardCount).toBeGreaterThan(0);
    expect(report.summary.overconcentratedCount).toBeGreaterThan(0);

    // Verify diagnostics list
    expect(report.diagnostics.length).toBeGreaterThan(0);
    report.diagnostics.forEach((d: any) => {
      expect(d.symbol).toBeDefined();
      expect(d.portfolio).toBeDefined();
      expect(d.quantity).toBeGreaterThan(0);
      expect(d.currentValue).toBeGreaterThan(0);
      expect(['SEVERE_LAGGARD', 'OVER_CONCENTRATED_RUNNER', 'MODERATE_DRAG', 'CORE_COMPOUNDER']).toContain(d.classification);
      expect(['FULL_EXIT_TAX_HARVEST', 'TRIM_PROFIT_25PCT', 'TRIM_OR_MONITOR', 'HOLD_AND_COMPOUND']).toContain(d.recommendedAction);
    });
  });

  it('correctly diagnoses severe laggards like ORIANA and SONUINFRA', () => {
    const report = sharedReport;
    const oriana = report.diagnostics.find((d: any) => d.symbol === 'ORIANA');
    const sonu = report.diagnostics.find((d: any) => d.symbol === 'SONUINFRA');

    if (oriana) {
      expect(oriana.classification).toBe('SEVERE_LAGGARD');
      expect(oriana.recommendedAction).toBe('FULL_EXIT_TAX_HARVEST');
      expect(oriana.unrealizedPnlPct).toBeLessThan(-25);
      expect(oriana.futureOutlook).toContain('technical');
    }

    if (sonu) {
      expect(sonu.classification).toBe('SEVERE_LAGGARD');
      expect(sonu.recommendedAction).toBe('FULL_EXIT_TAX_HARVEST');
      expect(sonu.unrealizedPnlPct).toBeLessThan(-25);
    }
  });

  it('correctly diagnoses over-concentrated SME runners like AKIKO', () => {
    const report = sharedReport;
    const akiko = report.diagnostics.find((d: any) => d.symbol === 'AKIKO');

    if (akiko) {
      expect(akiko.classification).toBe('OVER_CONCENTRATED_RUNNER');
      expect(akiko.recommendedAction).toBe('TRIM_PROFIT_25PCT');
      expect(akiko.unrealizedPnlPct).toBeGreaterThan(50);
      expect(akiko.portfolioWeightPct).toBeGreaterThan(15);
      expect(akiko.diagnosisReason).toContain('de-risk');
    }
  });

  it('provides curated intelligent paired switches with exact tax savings and alpha uplift', () => {
    const report = sharedReport;
    expect(report.switches.length).toBeGreaterThanOrEqual(3);

    // Switch 1: ORIANA -> Waaree Energies (Secondary Stock or Open IPO)
    const switch1 = report.switches.find((s: any) => s.id === 'SWITCH_ORIANA_WAAREE');
    expect(switch1).toBeDefined();
    expect(switch1?.sourceHolding.symbol).toBe('ORIANA');
    expect(switch1?.sourceHolding.action).toBe('FULL_EXIT_TAX_HARVEST');
    expect(['UPCOMING_IPO', 'GREENFIELD_STOCK']).toContain(switch1?.destinationCandidate.type);
    expect(switch1?.destinationCandidate.symbol).toBe('WAAREEENER');
    expect(switch1?.financialMetrics.taxHarvestingSavingsInr).toBeGreaterThan(1000000); // Saves ~₹11.9 Lakhs
    expect(switch1?.financialMetrics.netAlphaYieldUpliftPct).toBeGreaterThan(50);

    // Switch 2: SONUINFRA -> SOLARINDS
    const switch2 = report.switches.find((s: any) => s.id === 'SWITCH_SONUINFRA_SOLARINDS');
    expect(switch2).toBeDefined();
    expect(switch2?.sourceHolding.symbol).toBe('SONUINFRA');
    expect(switch2?.destinationCandidate.type).toBe('GREENFIELD_STOCK');
    expect(switch2?.financialMetrics.taxHarvestingSavingsInr).toBeGreaterThan(300000);
    expect(switch2?.financialMetrics.projected12MonthNetGainInr).toBeGreaterThan(900000);

    // Switch 3: AKIKO -> TRENT/HAL
    const switch3 = report.switches.find((s: any) => s.id === 'SWITCH_AKIKO_HAL_TRENT');
    expect(switch3).toBeDefined();
    expect(switch3?.sourceHolding.symbol).toBe('AKIKO');
    expect(switch3?.sourceHolding.action).toBe('TRIM_PROFIT_25PCT');
    expect(switch3?.financialMetrics.taxHarvestingSynergy).toContain('brought-forward long-term loss buffer');
  });

  it('simulates a rebalancing switch inside the paper trading sandbox', async () => {
    const res = await rebalanceService.simulateRebalanceSwitch('SWITCH_ORIANA_WAAREE', 'pot_conservative');
    expect(res.success).toBe(true);
    expect(res.message).toContain('Successfully executed simulated switch');
    expect(res.details).toBeDefined();
    expect(res.details.sourceSymbol).toBe('ORIANA');
    expect(res.details.destinationSymbol).toBe('WAAREEENER');
    expect(res.details.taxSavingsInr).toBeGreaterThan(0);
  });

  it('gracefully handles non-existent switch ID simulation', async () => {
    const res = await rebalanceService.simulateRebalanceSwitch('NON_EXISTENT_ID');
    expect(res.success).toBe(false);
    expect(res.message).toContain('not found');
  });
});
