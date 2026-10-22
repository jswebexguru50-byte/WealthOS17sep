/**
 * InstitutionalRiskParitySizer.ts — v5.3.1 (Enhanced Risk Geometry)
 * Target: NRI WealthOS Quant Engine
 * 
 * Features:
 * - Pure Volatility-Normalized Position Sizing (Fixed 1.0% equity risk per trade)
 * - Minimum ATR Stop Floor (Prevents over-allocation on tight micro-stops < 0.75x ATR)
 * - Capital Allocation Caps (12.5% single-stock ceiling, 25.0% single-sector ceiling)
 * - True TWR Unit NAV Drawdown Governor (Immune to external NRI wire transfers/repatriation)
 * - Conviction-Weighted Multiplier integration with MacroRegimeClassifierService
 */

import { roundINR } from '../../lib/decimalUtils.js';

export interface PositionSizingInput {
  portfolioEquityINR: number;
  unitNavCurrent: number;
  unitNavPeak30D: number;
  entryPrice: number;
  structuralStopPrice: number;
  atr14: number;
  currentSectorAllocationPct: number;
  regimeConvictionMultiplier?: number; // 0.0 to 1.5 derived from MacroRegimeClassifierService
}

export interface PositionSizingOutput {
  allowedShares: number;
  capitalCommittedINR: number;
  portfolioWeightPct: number;
  effectiveRiskRupees: number;
  isOrderPermitted: boolean;
  rejectionReason?: string;
  riskMultiplierApplied: number;
}

export class InstitutionalRiskParitySizer {
  private static readonly BASE_EQUITY_RISK_FRACTION = 0.01; // 1.0% Base Risk
  private static readonly MAX_SINGLE_STOCK_CAP_PCT = 0.125;  // 12.5% Max Capital Cap
  private static readonly MAX_SECTOR_CAP_PCT = 0.25;         // 25.0% Max Sector Cap
  private static readonly MIN_STOP_ATR_RATIO = 0.75;         // Stop floor: at least 0.75x ATR

  public static calculatePositionSize(input: PositionSizingInput): PositionSizingOutput {
    // 1. Calculate True Trading Drawdown via Unit NAV (TWR)
    const twrDrawdownPct = input.unitNavPeak30D > 0
      ? (input.unitNavPeak30D - input.unitNavCurrent) / input.unitNavPeak30D
      : 0;

    // Hard Circuit Breaker: >= 10% TWR drawdown halts new trade additions
    if (twrDrawdownPct >= 0.10) {
      return {
        allowedShares: 0,
        capitalCommittedINR: 0,
        portfolioWeightPct: 0,
        effectiveRiskRupees: 0,
        isOrderPermitted: false,
        rejectionReason: `Portfolio Trading Drawdown (${(twrDrawdownPct * 100).toFixed(1)}%) >= 10% Circuit Breaker. Capital Defense Active.`,
        riskMultiplierApplied: 0
      };
    }

    // Sector Concentration Ceiling
    if (input.currentSectorAllocationPct >= this.MAX_SECTOR_CAP_PCT) {
      return {
        allowedShares: 0,
        capitalCommittedINR: 0,
        portfolioWeightPct: 0,
        effectiveRiskRupees: 0,
        isOrderPermitted: false,
        rejectionReason: `Sector Exposure (${(input.currentSectorAllocationPct * 100).toFixed(1)}%) at maximum 25% allocation ceiling.`,
        riskMultiplierApplied: 0
      };
    }

    // 2. Heat Governor & Regime Conviction Multipliers
    let heatGovernorMultiplier = 1.0;
    if (twrDrawdownPct >= 0.05) {
      heatGovernorMultiplier = 0.5; // Throttle risk by 50% between 5% and 10% drawdown
    }

    const regimeMultiplier = input.regimeConvictionMultiplier !== undefined ? input.regimeConvictionMultiplier : 1.0;
    const combinedRiskMultiplier = heatGovernorMultiplier * regimeMultiplier;

    if (combinedRiskMultiplier <= 0) {
      return {
        allowedShares: 0,
        capitalCommittedINR: 0,
        portfolioWeightPct: 0,
        effectiveRiskRupees: 0,
        isOrderPermitted: false,
        rejectionReason: 'Macro Regime Classifier mandates 100% Cash Buffer (Multiplier = 0).',
        riskMultiplierApplied: 0
      };
    }

    // 3. Volatility-Normalized Distance Math
    const nominalStopDistance = input.entryPrice - input.structuralStopPrice;
    if (nominalStopDistance <= 0) {
      return {
        allowedShares: 0,
        capitalCommittedINR: 0,
        portfolioWeightPct: 0,
        effectiveRiskRupees: 0,
        isOrderPermitted: false,
        rejectionReason: 'Structural Stop Loss must be strictly below Entry Price.',
        riskMultiplierApplied: 0
      };
    }

    // Enforce ATR distance floor to prevent oversized leverage on tight stops
    const minAllowableStopDistance = input.atr14 * this.MIN_STOP_ATR_RATIO;
    const effectiveStopDistance = Math.max(nominalStopDistance, minAllowableStopDistance);

    // 4. Shares Allocation by Risk Budget
    const targetedRiskINR = input.portfolioEquityINR * this.BASE_EQUITY_RISK_FRACTION * combinedRiskMultiplier;
    let candidateShares = Math.floor(targetedRiskINR / effectiveStopDistance);

    // 5. Hard Capital Cap (Max 12.5% of total portfolio equity in one position)
    const maxCapitalAllowedINR = input.portfolioEquityINR * this.MAX_SINGLE_STOCK_CAP_PCT;
    if (candidateShares * input.entryPrice > maxCapitalAllowedINR) {
      candidateShares = Math.floor(maxCapitalAllowedINR / input.entryPrice);
    }

    const finalCapitalINR = roundINR(candidateShares * input.entryPrice);
    const actualRiskRupees = roundINR(candidateShares * nominalStopDistance);

    return {
      allowedShares: candidateShares,
      capitalCommittedINR: finalCapitalINR,
      portfolioWeightPct: roundINR((finalCapitalINR / input.portfolioEquityINR) * 100),
      effectiveRiskRupees: actualRiskRupees,
      isOrderPermitted: candidateShares > 0,
      riskMultiplierApplied: roundINR(combinedRiskMultiplier, 2)
    };
  }
}
