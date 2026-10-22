import { describe, it, expect, beforeEach } from 'vitest';
import {
  IpoAnalysisEngine,
  IpoAnalysisRecord
} from '../../src/server/services/IpoAnalysisEngine.js';

describe('Upcoming IPO Analysis & Recommendation Engine', () => {
  let engine: IpoAnalysisEngine;

  beforeEach(() => {
    engine = IpoAnalysisEngine.getInstance();
  });

  it('retrieves the active and upcoming IPO universe with complete data models', () => {
    const ipos = engine.getUpcomingIpos();
    expect(ipos.length).toBeGreaterThanOrEqual(6);

    ipos.forEach((ipo) => {
      expect(ipo.id).toBeDefined();
      expect(ipo.companyName).toBeDefined();
      expect(ipo.symbol).toBeDefined();
      expect(ipo.sector).toBeDefined();
      expect(ipo.priceBand.max).toBeGreaterThan(ipo.priceBand.min);
      expect(ipo.lotSize).toBeGreaterThan(0);
      expect(ipo.minInvestment).toBe(ipo.priceBand.max * ipo.lotSize);
      expect(ipo.issueSize.totalCr).toBeGreaterThan(0);
      expect(ipo.issueSize.freshIssueCr + ipo.issueSize.ofsCr).toBeCloseTo(ipo.issueSize.totalCr, 0);
      expect(ipo.gmp).toBeDefined();
      expect(ipo.gmp.source).toContain('Chittorgarh');
      expect(ipo.subscription).toBeDefined();
      expect(ipo.financials).toBeDefined();
      expect(ipo.peerComparison.length).toBeGreaterThan(0);
      expect(ipo.verdict).toBeDefined();
      expect(['APPLY_HIGH_CONVICTION', 'APPLY_LISTING_GAINS', 'WATCH', 'AVOID']).toContain(ipo.verdict.action);
    });
  });

  it('correctly classifies Waaree Energies as APPLY_HIGH_CONVICTION with massive listing gains', () => {
    const waaree = engine.getIpoById('WAAREEENER');
    expect(waaree).not.toBeNull();
    expect(waaree?.verdict.action).toBe('APPLY_HIGH_CONVICTION');
    expect(waaree?.verdict.overallScore).toBeGreaterThanOrEqual(90);
    expect(waaree?.verdict.confidenceLevelPct).toBeGreaterThanOrEqual(90);
    expect(waaree?.gmp.listingGainPct).toBeGreaterThan(80);
    expect(waaree?.financials.rocePct).toBeGreaterThan(30);
    expect(waaree?.issueSize.ofsPct).toBeLessThan(25); // 83%+ Fresh capital
  });

  it('correctly classifies Hyundai Motor India as AVOID due to 100% OFS, high pricing, and negative GMP', () => {
    const hyundai = engine.getIpoById('HYUNDAI');
    expect(hyundai).not.toBeNull();
    expect(hyundai?.verdict.action).toBe('AVOID');
    expect(hyundai?.issueSize.ofsPct).toBe(100);
    expect(hyundai?.issueSize.freshIssueCr).toBe(0);
    expect(hyundai?.gmp.listingGainPct).toBeLessThan(0); // Negative GMP
    expect(hyundai?.subscription.retailTimes).toBeLessThan(1.0); // Undersubscribed
    expect(hyundai?.verdict.summaryRationale).toContain('100% OFS');
  });

  it('correctly classifies Premier Energies as APPLY_LISTING_GAINS due to >100% GMP surge', () => {
    const premier = engine.getIpoById('PREMIERENE');
    expect(premier).not.toBeNull();
    expect(premier?.verdict.action).toBe('APPLY_LISTING_GAINS');
    expect(premier?.gmp.listingGainPct).toBeGreaterThanOrEqual(100);
    expect(premier?.subscription.qibTimes).toBeGreaterThan(200);
  });

  it('correctly classifies Afcons Infrastructure as AVOID due to high OFS to service group debt', () => {
    const afcons = engine.getIpoById('AFCONS');
    expect(afcons).not.toBeNull();
    expect(afcons?.verdict.action).toBe('AVOID');
    expect(afcons?.issueSize.ofsPct).toBeGreaterThan(70);
    expect(afcons?.financials.cfoPositive).toBe(false);
  });

  it('correctly classifies NTPC Green Energy as APPLY_HIGH_CONVICTION due to 100% Fresh Issue capital', () => {
    const ntpcGreen = engine.getIpoById('NTPCGREEN');
    expect(ntpcGreen).not.toBeNull();
    expect(ntpcGreen?.verdict.action).toBe('APPLY_HIGH_CONVICTION');
    expect(ntpcGreen?.issueSize.freshIssueCr).toBe(10000);
    expect(ntpcGreen?.issueSize.ofsPct).toBe(0);
  });

  it('provides listed peer comparison matrix with comparative valuation ratios', () => {
    const swiggy = engine.getIpoById('SWIGGY');
    expect(swiggy).not.toBeNull();
    const zomatoPeer = swiggy?.peerComparison.find(p => p.company.includes('Zomato'));
    expect(zomatoPeer).toBeDefined();
    expect(zomatoPeer?.marketCapCr).toBeGreaterThan(swiggy?.peerComparison[0].marketCapCr || 0);
  });

  it('supports lookup by ID or symbol case-insensitively', () => {
    const ipo1 = engine.getIpoById('ipo_waaree_energies');
    const ipo2 = engine.getIpoById('waareeener');
    expect(ipo1).not.toBeNull();
    expect(ipo2).not.toBeNull();
    expect(ipo1?.symbol).toBe(ipo2?.symbol);
  });

  it('simulates an IPO retail application in the paper trading pot', async () => {
    const res = await engine.simulateIpoApplication({
      ipoId: 'ipo_waaree_energies',
      potId: 'pot_conservative',
      bidCategory: 'RETAIL',
      lotsCount: 1
    });

    expect(res.success).toBe(true);
    expect(res.applicationDetails).toBeDefined();
    expect(res.applicationDetails?.lotsApplied).toBe(1);
    expect(res.applicationDetails?.sharesApplied).toBe(9);
    expect(res.applicationDetails?.applicationAmount).toBe(9 * 1503);
    expect(res.applicationDetails?.estimatedListingGain).toBe(9 * 1450);
  });
});
