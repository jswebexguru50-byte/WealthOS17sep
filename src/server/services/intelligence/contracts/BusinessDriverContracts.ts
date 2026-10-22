/**
 * BusinessDriverContracts.ts — Wave 0 Contract Freeze
 *
 * Business driver model for WealthOS V2.
 *
 * Key design decisions:
 * - PRIMARY vs SECONDARY materiality: Overview shows PRIMARY (top 5); Business tab shows all
 * - Driver DEFINITION (what structurally drives this company) is separate from
 *   Driver STATE (what is happening to that driver now)
 * - Direction requires ≥2 data points (C5, C6); single value → UNKNOWN
 * - Sector-specific driver templates (not one template for all)
 */

import { EvidenceReference } from './Provenance.js';

// ─── Driver Taxonomy ──────────────────────────────────────────────────────────

export type DriverCategory =
  | 'VOLUME'        // units sold, loans disbursed, production
  | 'PRICE'         // realization, NIM, ASP
  | 'MARGIN'        // EBITDA margin, NIMs, credit spreads
  | 'CAPACITY'      // installed capacity, store count, branch count
  | 'UTILISATION'   // capacity utilisation, occupancy
  | 'ORDER_BOOK'    // TCV, backlog, order intake
  | 'MARKET_SHARE'  // relative competitive position
  | 'CUSTOMER'      // customer concentration, adds, churn
  | 'PRODUCT'       // mix, new launches, premiumisation
  | 'GEOGRAPHY'     // regional exposure, export mix
  | 'COST'          // commodity cost, opex, CoF
  | 'CAPEX'         // investment cycle
  | 'DEBT'          // leverage, net debt/EBITDA
  | 'REGULATION'    // regulatory exposure or benefit
  | 'OTHER';

export type DriverDirection =
  | 'IMPROVING'
  | 'DETERIORATING'
  | 'STABLE'
  | 'MIXED'
  | 'UNKNOWN';      // always UNKNOWN when only one data point available

/**
 * PRIMARY = shows on Overview tab (top 5 per business model)
 * SECONDARY = available in Business & Fundamentals tab
 */
export type DriverMateriality = 'PRIMARY' | 'SECONDARY';

// ─── Driver Definition (structural — does not change run-to-run) ──────────────

export interface BusinessDriverDefinition {
  driverId: string;                        // e.g. 'tata_motors_jlr_volumes'
  name: string;                            // e.g. 'JLR Volumes'
  category: DriverCategory;
  description: string;                     // what this driver represents
  materiality: DriverMateriality;
  relatedMetrics: string[];                // canonical metric names
  sectorTemplate?: string;                 // e.g. 'BANK', 'IT_SERVICES'
}

// ─── Driver State (computed each run from latest evidence) ────────────────────

export interface BusinessDriverState {
  driverId: string;
  currentState: string | null;             // human-readable description of latest value
  direction: DriverDirection;              // requires ≥2 data points
  directionPeriods?: string;               // e.g. 'FY24 → FY25'
  evidence: EvidenceReference[];
  evaluatedAt: string;                     // ISO timestamp
}

// ─── Combined Driver (for runtime use) ───────────────────────────────────────

export interface BusinessDriver extends BusinessDriverDefinition, BusinessDriverState {}

// ─── Engine Input (rich — not just fundamentals) ─────────────────────────────

export interface BusinessDriverInput {
  symbol: string;
  businessModel: string;
  canonicalFacts: Record<string, any>;     // metric → fact envelope
  operatingKpis?: Record<string, any>;     // sector KPIs from DB
  managementEvidence?: any;               // from management module
  historicalDrivers?: BusinessDriver[];   // persisted prior state for stability
}

// ─── Engine Output ────────────────────────────────────────────────────────────

export interface BusinessDriverResult {
  securityId: string;
  symbol: string;
  businessModel: string;
  drivers: BusinessDriver[];               // ALL drivers (no top-5 cap)
  primaryDrivers: BusinessDriver[];        // drivers where materiality === 'PRIMARY'
  coverage: 'FULL' | 'PARTIAL' | 'MINIMAL';
  evaluatedAt: string;
}
