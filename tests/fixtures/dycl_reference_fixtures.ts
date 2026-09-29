/**
 * dycl_reference_fixtures.ts — Test Fixtures Only
 *
 * DYCL-specific curated events, drivers, and reference commitments.
 * MUST NOT be imported by production intelligence code.
 * Import only in test setup files.
 */

import { CompanyEvent } from '../../src/server/services/intelligence/contracts/CompanyEvent.js';
import { CompanyDriverDefinition } from '../../src/server/services/intelligence/business/CompanyDriverRegistry.js';

const DYCL_ISIN = 'INE600Y01019';
const DYCL_SYMBOL = 'DYCL';

// ─── Curated DYCL Events (moved from CompanyEventRepository production code) ──

export const DYCL_CURATED_EVENTS: CompanyEvent[] = [
  {
    eventId: `evt_${DYCL_ISIN}_mgmt_change_sep2026`,
    securityId: DYCL_ISIN,
    eventType: 'MANAGEMENT_CHANGE',
    occurredAt: '2026-09-08',
    availableAt: '2026-09-08T18:30:00Z',
    materiality: 'HIGH',
    title: 'Executive Disclosures: Two Senior Management Departures',
    description: 'Two senior executive departures disclosed in September; operational impact unverified.',
    evidenceRefs: [{
      evidenceId: `ev_${DYCL_ISIN}_mgmt_change_reg30`,
      sourceType: 'REGULATORY_DISCLOSURE',
      sourceName: 'BSE Regulation 30 Disclosure — Change in Senior Management Personnel',
      documentDate: '2026-09-08',
      availableAt: '2026-09-08T18:30:00Z',
      pitStatus: 'PIT_VERIFIED',
      quote: 'Disclosure under Regulation 30 regarding resignation of two senior operational executives.',
      extractionMethod: 'MANUAL_AUDITED',
    }],
    affectedDomains: ['MANAGEMENT', 'GOVERNANCE'],
  },
  {
    eventId: `evt_${DYCL_ISIN}_order_win_rdss`,
    securityId: DYCL_ISIN,
    eventType: 'ORDER_WIN',
    occurredAt: '2026-07-22',
    availableAt: '2026-07-22T14:15:00Z',
    materiality: 'MEDIUM',
    title: 'Order Inflow: Distribution Utility Supply Contract',
    description: 'Secured ₹112 Cr order for medium-voltage cabling under government RDSS distribution modernization.',
    evidenceRefs: [{
      evidenceId: `ev_${DYCL_ISIN}_order_rdss`,
      sourceType: 'EXCHANGE_FILING',
      sourceName: 'NSE Corporate Announcement — Receipt of Commercial Order',
      documentDate: '2026-07-22',
      availableAt: '2026-07-22T14:15:00Z',
      pitStatus: 'PIT_VERIFIED',
      quote: 'Company received purchase orders aggregating to ₹112 Cr from state electricity distribution companies.',
      extractionMethod: 'MANUAL_AUDITED',
    }],
    affectedDomains: ['FUNDAMENTALS', 'MANAGEMENT'],
  },
  {
    eventId: `evt_${DYCL_ISIN}_shareholding_q1_fy27`,
    securityId: DYCL_ISIN,
    eventType: 'SHAREHOLDING_CHANGE',
    occurredAt: '2026-07-15',
    availableAt: '2026-07-15T12:00:00Z',
    materiality: 'MEDIUM',
    title: 'Shareholding Pattern Disclosure: Q1 FY27',
    description: 'Promoter holding at 74.44%; zero reported domestic mutual-fund ownership.',
    evidenceRefs: [{
      evidenceId: `ev_${DYCL_ISIN}_sh_q1fy27`,
      sourceType: 'SHAREHOLDING_DISCLOSURE',
      sourceName: 'BSE Regulation 31 Shareholding Pattern for Quarter Ended June 30, 2026',
      documentDate: '2026-07-15',
      availableAt: '2026-07-15T12:00:00Z',
      pitStatus: 'PIT_VERIFIED',
      quote: 'Promoter & Promoter Group holding: 74.44%, Mutual Funds: 0.00%.',
      extractionMethod: 'MANUAL_AUDITED',
    }],
    affectedDomains: ['GOVERNANCE'],
  },
];

// ─── Curated DYCL Business Drivers (moved from CompanyDriverRegistry production code) ─

export const DYCL_BUSINESS_DRIVERS: CompanyDriverDefinition[] = [
  {
    securityId: DYCL_ISIN,
    symbol: DYCL_SYMBOL,
    driverId: 'dycl_hv_cable_mix',
    name: 'HV & LV Cable Mix / Higher-Margin Power Cables',
    description: 'Product mix shift from bare conductors to higher-margin 66kV/132kV high-voltage insulated cables',
    category: 'MARGIN',
    materiality: 'PRIMARY',
    linkedMetrics: ['ebitda_cr', 'revenue_cr'],
    linkedSegments: ['Power Cables'],
    thesisPillarIds: ['margin_expansion_hv_mix'],
    source: 'COMPANY_SPECIFIC',
  },
  {
    securityId: DYCL_ISIN,
    symbol: DYCL_SYMBOL,
    driverId: 'dycl_order_book',
    name: 'Executable Order Book & Distribution Tenders',
    description: 'Execution pace on ₹800+ Cr order backlog across DISCOMs, railways, and private EPCs',
    category: 'ORDER_BOOK',
    materiality: 'PRIMARY',
    linkedMetrics: ['revenue_cr', 'order_book_cr'],
    linkedSegments: ['Tender Orders'],
    thesisPillarIds: ['order_book_execution'],
    source: 'COMPANY_SPECIFIC',
  },
  {
    securityId: DYCL_ISIN,
    symbol: DYCL_SYMBOL,
    driverId: 'dycl_working_capital_receivables',
    name: 'Working Capital & Trade Receivables Intensity',
    description: 'Debtor days and cash conversion cycle driven by state utility payment milestones',
    category: 'OTHER',
    materiality: 'PRIMARY',
    linkedMetrics: ['trade_receivables_cr', 'cfo_cr'],
    linkedSegments: ['Cash Flow'],
    thesisPillarIds: ['working_capital_discipline'],
    source: 'COMPANY_SPECIFIC',
  },
  {
    securityId: DYCL_ISIN,
    symbol: DYCL_SYMBOL,
    driverId: 'dycl_railway_reconductoring',
    name: 'Railway Electrification & Reconductoring Demand',
    description: 'Supply of specialized catenary conductors and high-ampacity cables for railway corridor upgrades',
    category: 'VOLUME',
    materiality: 'PRIMARY',
    linkedMetrics: ['revenue_cr'],
    linkedSegments: ['Railways'],
    source: 'COMPANY_SPECIFIC',
  },
  {
    securityId: DYCL_ISIN,
    symbol: DYCL_SYMBOL,
    driverId: 'dycl_metal_passthrough',
    name: 'Raw Material Pass-through (Copper / Aluminium)',
    description: 'Contractual price-variation clauses insulating operating margin against base metal swings',
    category: 'COST',
    materiality: 'SECONDARY',
    linkedMetrics: ['ebitda_cr'],
    linkedSegments: ['Procurement'],
    source: 'COMPANY_SPECIFIC',
  },
];
