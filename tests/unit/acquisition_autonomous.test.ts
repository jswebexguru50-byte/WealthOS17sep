/**
 * acquisition_autonomous.test.ts — Unit & Integration Tests for Gate 1 Autonomous Acquisition
 * WealthOS V2 Gate 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityIdentity } from '../../src/server/services/intelligence/contracts/SecurityIdentity.js';
import { AutonomousAcquisitionManager } from '../../src/server/services/intelligence/acquisition/AutonomousAcquisitionManager.js';
import { ExchangeAnnouncementAdapter } from '../../src/server/services/intelligence/acquisition/adapters/ExchangeAnnouncementAdapter.js';
import { FinancialResultsAdapter } from '../../src/server/services/intelligence/acquisition/adapters/FinancialResultsAdapter.js';
import { AnnualReportAdapter } from '../../src/server/services/intelligence/acquisition/adapters/AnnualReportAdapter.js';
import { InvestorPresentationAdapter } from '../../src/server/services/intelligence/acquisition/adapters/InvestorPresentationAdapter.js';
import { ShareholdingAdapter } from '../../src/server/services/intelligence/acquisition/adapters/ShareholdingAdapter.js';
import { CorporateActionAdapter } from '../../src/server/services/intelligence/acquisition/adapters/CorporateActionAdapter.js';

describe('Gate 1: Autonomous Source Acquisition Architecture', () => {
  const dyclIdentity: SecurityIdentity = {
    securityId: 'INE000000001',
    isin: 'INE000000001',
    nseSymbol: 'DYCL',
    companyName: 'Dynamic Cables Limited',
    sector: 'Industrial Machinery',
    industry: 'Cables & Electricals',
  };

  it('1. registers all 6 required disclosure adapters', () => {
    const manager = AutonomousAcquisitionManager.getInstance();
    const registered = manager.getRegisteredAdapters();

    expect(registered).toContain('EXCHANGE_ANNOUNCEMENT');
    expect(registered).toContain('FINANCIAL_RESULTS');
    expect(registered).toContain('ANNUAL_REPORT');
    expect(registered).toContain('INVESTOR_PRESENTATION');
    expect(registered).toContain('SHAREHOLDING_DISCLOSURE');
    expect(registered).toContain('CORPORATE_ACTION');
    expect(registered.length).toBeGreaterThanOrEqual(6);
  });

  it('2. ExchangeAnnouncementAdapter discovers and fetches regulatory announcements', async () => {
    const adapter = ExchangeAnnouncementAdapter.getInstance();
    const docs = await adapter.discover(dyclIdentity, '2026-01-01');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].sourceType).toBe('EXCHANGE_ANNOUNCEMENT');
    expect(docs[0].sourceAuthority).toBe('NSE');

    const raw = await adapter.fetch(docs[0]);
    expect(raw.text).toContain('DYCL');
    expect(raw.forwardLookingStatements?.length).toBeGreaterThan(0);
  });

  it('3. FinancialResultsAdapter discovers and normalizes financial metrics', async () => {
    const adapter = FinancialResultsAdapter.getInstance();
    const docs = await adapter.discover(dyclIdentity, '2026-01-01');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].sourceType).toBe('FINANCIAL_RESULTS');

    const raw = await adapter.fetch(docs[0]);
    expect(raw.financialMetrics).toBeDefined();
    expect(raw.financialMetrics?.metrics.revenue_cr).toBeGreaterThan(0);
    expect(raw.financialMetrics?.metrics.ebitda_cr).toBeGreaterThan(0);
  });

  it('4. AnnualReportAdapter discovers and parses integrated annual reports', async () => {
    const adapter = AnnualReportAdapter.getInstance();
    const docs = await adapter.discover(dyclIdentity, '2025-01-01');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].sourceType).toBe('ANNUAL_REPORT');

    const raw = await adapter.fetch(docs[0]);
    expect(raw.financialMetrics?.periodType).toBe('ANNUAL');
    expect(raw.financialMetrics?.metrics.roce_pct).toBeGreaterThan(0);
  });

  it('5. ShareholdingAdapter discovers Clause 31 shareholding disclosures', async () => {
    const adapter = ShareholdingAdapter.getInstance();
    const docs = await adapter.discover(dyclIdentity, '2026-01-01');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].sourceType).toBe('SHAREHOLDING_DISCLOSURE');

    const raw = await adapter.fetch(docs[0]);
    expect(raw.rawMetadata?.promoterHoldingPct).toBeGreaterThan(0);
    expect(raw.rawMetadata?.pledgedPct).toBe(0.0);
  });

  it('6. CorporateActionAdapter discovers dividend and corporate actions', async () => {
    const adapter = CorporateActionAdapter.getInstance();
    const docs = await adapter.discover(dyclIdentity, '2026-01-01');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].sourceType).toBe('CORPORATE_ACTION');

    const raw = await adapter.fetch(docs[0]);
    expect(raw.rawMetadata?.actionType).toBe('DIVIDEND');
  });

  it('7. AutonomousAcquisitionManager executes multi-source acquisition with strict idempotency', async () => {
    const manager = AutonomousAcquisitionManager.getInstance();
    const testSince = new Date().toISOString();

    // First acquisition run with new disclosures
    const firstRun = await manager.acquireDisclosuresForCompany(dyclIdentity, testSince);
    expect(firstRun.documentsDiscovered).toBeGreaterThanOrEqual(6);
    expect(firstRun.documentsIngested).toBeGreaterThanOrEqual(1);

    // Second run with identical disclosures — must be deduplicated via SHA-256 idempotency key
    const secondRun = await manager.acquireDisclosuresForCompany(dyclIdentity, testSince);
    expect(secondRun.duplicatesSkipped).toBeGreaterThanOrEqual(firstRun.documentsIngested);
    expect(secondRun.factsCreated).toBe(0);
    expect(secondRun.eventsCreated).toBe(0);
    expect(secondRun.commitmentsCreated).toBe(0);
  });
});
