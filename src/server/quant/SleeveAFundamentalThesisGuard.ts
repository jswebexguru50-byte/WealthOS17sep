/**
 * SleeveAFundamentalThesisGuard.ts — v5.4.1 (Production Master)
 * Quarterly Fundamental Invalidation Engine for Core Compounders (Sleeve A).
 * 
 * Features:
 * 1. Immediate 100% Liquidation on Catastrophic Governance (Auditor resignation, Forensic red flag, Pledge >= 30%)
 * 2. 50% De-risking Trim on Economic/Balance Sheet Deterioration (ROIC < WACC 2Q, Net Debt/EBITDA >= 3.5x)
 * 3. Banking & NBFC Exemption (Bypasses Net Debt/EBITDA for Financial Holdings, enforces Capital Adequacy / NPA)
 * 4. Secular Technical Guardrail (3 consecutive weekly closes > 12% below rising SMA200)
 */

export interface QuarterlyHealthAudit {
  symbol: string;
  quarterCode: string;                          // e.g. 'Q2-FY26'
  sector?: string;                              // e.g. 'Banking', 'Conglomerate', 'Auto'
  isFinancialInstitution?: boolean;             // Banks, NBFCs, Wealth / Financial Holdings
  capitalAdequacyRatioPct?: number;             // For Financials: CAR % (e.g. 16.5)
  grossNpaPct?: number;                         // For Financials: Gross NPA % (e.g. 1.8)
  consecutiveQuartersRoicBelowWacc: number;
  promoterPledgePct: number;
  netDebtToEbitda: number;
  forensicGovernanceRedFlags: boolean;
  auditorResignation: boolean;
  weeklyClosesBelowSMA200By12Pct: number;       // Count of consecutive weekly closes > 12% below 200-SMA
}

export interface InvalidationSignal {
  action: 'MAINTAIN' | 'TRIM_50_PERCENT' | 'FULL_LIQUIDATION';
  invalidationTriggered: boolean;
  reason: string;
}

export class SleeveAFundamentalThesisGuard {
  public static auditPositionHealth(audit: QuarterlyHealthAudit): InvalidationSignal {
    // 1. Catastrophic Governance & Forensic Red Flags -> Immediate 100% Exit
    if (audit.auditorResignation) {
      return {
        action: 'FULL_LIQUIDATION',
        invalidationTriggered: true,
        reason: 'Statutory Auditor Resigned Abruptly. Severe Governance Red Flag. Immediate liquidation mandated.'
      };
    }

    if (audit.forensicGovernanceRedFlags) {
      return {
        action: 'FULL_LIQUIDATION',
        invalidationTriggered: true,
        reason: 'Forensic Accounting Red Flag (Related-Party Transactions / Accrual Manipulation). Immediate liquidation mandated.'
      };
    }

    if ((audit.promoterPledgePct || 0) >= 30.0) {
      return {
        action: 'FULL_LIQUIDATION',
        invalidationTriggered: true,
        reason: `Promoter Pledge (${audit.promoterPledgePct.toFixed(1)}%) exceeds 30.0% danger ceiling. Risk of margin-call liquidation cascade.`
      };
    }

    // 2. Financial Sector vs Non-Financial Balance Sheet Audit
    const sectorUpper = (audit.sector || '').toUpperCase();
    const isFinancial = audit.isFinancialInstitution || 
      sectorUpper.includes('BANK') || 
      sectorUpper.includes('NBFC') || 
      sectorUpper.includes('FINANCE') ||
      sectorUpper.includes('HOLDING');

    if (isFinancial) {
      // Financials audited via Capital Adequacy Ratio and Gross NPA
      if (audit.capitalAdequacyRatioPct != null && audit.capitalAdequacyRatioPct < 15.0) {
        return {
          action: 'TRIM_50_PERCENT',
          invalidationTriggered: true,
          reason: `Capital Adequacy Ratio (${audit.capitalAdequacyRatioPct.toFixed(1)}%) breached 15.0% regulatory comfort floor.`
        };
      }
      if (audit.grossNpaPct != null && audit.grossNpaPct >= 4.0) {
        return {
          action: 'TRIM_50_PERCENT',
          invalidationTriggered: true,
          reason: `Gross NPA (${audit.grossNpaPct.toFixed(1)}%) exceeded 4.0% asset quality ceiling.`
        };
      }
    } else {
      // Non-Financials: Enforce Net Debt / EBITDA <= 3.5x
      if ((audit.netDebtToEbitda || 0) >= 3.5) {
        return {
          action: 'TRIM_50_PERCENT',
          invalidationTriggered: true,
          reason: `Balance Sheet Deterioration: Net Debt/EBITDA (${audit.netDebtToEbitda.toFixed(1)}x) exceeds 3.5x safety ceiling.`
        };
      }
    }

    // 3. Business Economic Deterioration -> Trim 50%
    if ((audit.consecutiveQuartersRoicBelowWacc || 0) >= 2) {
      return {
        action: 'TRIM_50_PERCENT',
        invalidationTriggered: true,
        reason: 'Economic Moat Erosion: ROIC has remained below WACC for 2 consecutive quarters without ongoing expansion CapEx offset.'
      };
    }

    // 4. Macro Structural Price Guardrail (3 Consecutive Weekly Closes > 12% Below SMA200)
    if ((audit.weeklyClosesBelowSMA200By12Pct || 0) >= 3) {
      return {
        action: 'TRIM_50_PERCENT',
        invalidationTriggered: true,
        reason: 'Structural Secular Breakdown: Price closed >12% below 200-day SMA for 3 consecutive weekly closes. De-risking 50% to cash.'
      };
    }

    return {
      action: 'MAINTAIN',
      invalidationTriggered: false,
      reason: 'Fundamental thesis robust; economic moat and balance sheet health validated.'
    };
  }
}
