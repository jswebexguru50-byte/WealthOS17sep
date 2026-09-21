import * as crypto from 'crypto';
import { R4Experiment } from './R4HypothesisRegistry';
import { R4AuthenticFeatureProvider } from './R4AuthenticFeatureProvider';
import { R4LifecycleEngine } from './R4LifecycleEngine';

export interface R4ReplayedTrade {
  tradeId: string;
  decisionId: string;
  strategyId: string;
  securityId: string;
  decisionTimestamp: string;
  entry: number;
  exit: number;
  stop: number;
  quantity: number;
  gross: number;
  cost: number;
  net: number;
  strategyStopRiskR: number;
  nominalOnePercentR: number;
  isRetained: boolean;
  suppressionReason?: string;
  candidateScore?: number;
  provenanceHash?: string;
}

export interface CandidateReplaySummary {
  experimentId: string;
  candidateFamily: string;
  mode: string;
  totalBaselineTrades: number;
  retainedTrades: number;
  suppressedTrades: number;
  retentionRatePct: number;
  grossPnL: number;
  totalCosts: number;
  netPnL: number;
  meanStrategyStopRiskR: number;
  meanNominalOnePercentR: number;
  winRatePct: number;
  profitFactor: number;
  turnoverRupees: number;
  frictionSavedINR?: number;
}

export class R4CandidateEngine {
  public static evaluateTrade(
    t: any,
    exp: R4Experiment
  ): { isRetained: boolean; reason?: string; score?: number; provenanceHash?: string; adjustedTrade?: any } {
    const securityId = t.securityId || t.symbol || 'SECURITY_' + (t.tradeId ? t.tradeId.substring(0, 4) : '001');
    const decisionDate = t.decisionTimestamp || t.entryDate || '2022-01-01';

    // ------------------------------------------------------------------------
    // LIFECYCLE EXPERIMENTS
    // ------------------------------------------------------------------------
    if (exp.candidateFamily === 'LIFECYCLE' || (exp.mode as string) === 'LIFECYCLE_RULE') {
      const policyId = exp.parameters?.lifecyclePolicy || 'L1_EXISTING_BASELINE';
      const lcRes = R4LifecycleEngine.evaluateLifecyclePolicy(t, policyId as string);
      return {
        isRetained: lcRes.isRetained,
        reason: lcRes.reason,
        score: lcRes.adjustedHoldingSessions * 20,
        provenanceHash: crypto.createHash('sha256').update(JSON.stringify(lcRes)).digest('hex'),
        adjustedTrade: {
          entry: lcRes.adjustedEntry,
          exit: lcRes.adjustedExit,
          gross: lcRes.adjustedGross,
          cost: lcRes.adjustedCosts,
          net: lcRes.adjustedNet,
          holdingSessions: lcRes.adjustedHoldingSessions,
          frictionSavedINR: lcRes.frictionSavedINR
        }
      };
    }

    // ------------------------------------------------------------------------
    // TECHNICAL & FUNDAMENTAL FEATURE EXPERIMENTS (AUTHENTIC LOOKUP)
    // ------------------------------------------------------------------------
    switch (exp.candidateFamily) {
      case 'HF-RS': {
        const rsRes = R4AuthenticFeatureProvider.getMansfieldRS(securityId, decisionDate);
        if (rsRes.status !== 'READY' || !rsRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${rsRes.status}`, provenanceHash: rsRes.provenanceHash };
        }
        const minRs = (exp.parameters?.minRelativeStrength as number) || (exp.parameters?.threshold as number) || 70;
        const pass = rsRes.value.percentileRank >= minRs;
        return {
          isRetained: pass,
          reason: pass ? undefined : `RS_RANK_${rsRes.value.percentileRank}_BELOW_${minRs}`,
          score: rsRes.value.percentileRank,
          provenanceHash: rsRes.provenanceHash
        };
      }

      case 'HF-TREND': {
        const trendRes = R4AuthenticFeatureProvider.getEmaTrendStructure(securityId, decisionDate);
        if (trendRes.status !== 'READY' || !trendRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${trendRes.status}`, provenanceHash: trendRes.provenanceHash };
        }
        const pass = trendRes.value.isBullishAligned;
        return {
          isRetained: pass,
          reason: pass ? undefined : 'EMA_TREND_MISALIGNED',
          score: pass ? 85 : 35,
          provenanceHash: trendRes.provenanceHash
        };
      }

      case 'HF-VOL': {
        const atrRes = R4AuthenticFeatureProvider.getAtrVolatility(securityId, decisionDate);
        if (atrRes.status !== 'READY' || !atrRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${atrRes.status}`, provenanceHash: atrRes.provenanceHash };
        }
        const maxAtr = (exp.parameters?.maxAtrPct as number) || 5.0;
        const pass = atrRes.value.atrPct <= maxAtr;
        return {
          isRetained: pass,
          reason: pass ? undefined : `ATR_${atrRes.value.atrPct.toFixed(1)}PCT_EXCEEDS_${maxAtr}PCT`,
          score: Math.max(0, Math.min(100, 100 - atrRes.value.atrPct * 10)),
          provenanceHash: atrRes.provenanceHash
        };
      }

      case 'HF-VCP': {
        const vcpRes = R4AuthenticFeatureProvider.getVcpPattern(securityId, decisionDate);
        if (vcpRes.status !== 'READY' || !vcpRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${vcpRes.status}`, provenanceHash: vcpRes.provenanceHash };
        }
        const minReq = (exp.parameters?.minContractions as number) || 2;
        const pass = vcpRes.value.contractionsCount >= minReq;
        return {
          isRetained: pass,
          reason: pass ? undefined : `VCP_CONTRACTIONS_${vcpRes.value.contractionsCount}_BELOW_${minReq}`,
          score: vcpRes.value.contractionsCount * 25,
          provenanceHash: vcpRes.provenanceHash
        };
      }

      case 'HF-NR': {
        const nrRes = R4AuthenticFeatureProvider.getNr7Pattern(securityId, decisionDate);
        if (nrRes.status !== 'READY' || !nrRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${nrRes.status}`, provenanceHash: nrRes.provenanceHash };
        }
        const pass = nrRes.value.isNr7;
        return {
          isRetained: pass,
          reason: pass ? undefined : 'NR7_COMPRESSION_ABSENT',
          score: pass ? 90 : 25,
          provenanceHash: nrRes.provenanceHash
        };
      }

      case 'HF-VOLSURGE': {
        const rvolRes = R4AuthenticFeatureProvider.getRelativeVolume(securityId, decisionDate);
        if (rvolRes.status !== 'READY' || !rvolRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${rvolRes.status}`, provenanceHash: rvolRes.provenanceHash };
        }
        const minRvol = (exp.parameters?.minRvol as number) || (exp.parameters?.rvolThreshold as number) || 1.5;
        const pass = rvolRes.value.relativeVolume >= minRvol;
        return {
          isRetained: pass,
          reason: pass ? undefined : `RVOL_${rvolRes.value.relativeVolume.toFixed(1)}X_BELOW_${minRvol}X`,
          score: rvolRes.value.relativeVolume * 30,
          provenanceHash: rvolRes.provenanceHash
        };
      }

      case 'HF-QUAL': {
        const qualRes = R4AuthenticFeatureProvider.getPiotroskiScore(securityId, decisionDate);
        if (qualRes.status !== 'READY' || !qualRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${qualRes.status}`, provenanceHash: qualRes.provenanceHash };
        }
        const minPiotroski = (exp.parameters?.minScore as number) || (exp.parameters?.minPiotroski as number) || 5;
        const pass = qualRes.value.score >= minPiotroski;
        return {
          isRetained: pass,
          reason: pass ? undefined : `PIOTROSKI_${qualRes.value.score}_BELOW_${minPiotroski}`,
          score: qualRes.value.score * 10,
          provenanceHash: qualRes.provenanceHash
        };
      }

      case 'HF-REGIME': {
        const regRes = R4AuthenticFeatureProvider.getSectorRegime(securityId, decisionDate);
        if (regRes.status !== 'READY' || !regRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${regRes.status}`, provenanceHash: regRes.provenanceHash };
        }
        const permitted = (exp.parameters?.permittedRegimes as string[]) || ['BULL_TRENDING', 'LOW_VOL'];
        const pass = permitted.includes(regRes.value.marketRegime);
        return {
          isRetained: pass,
          reason: pass ? undefined : `REGIME_${regRes.value.marketRegime}_NOT_PERMITTED`,
          score: pass ? 80 : 30,
          provenanceHash: regRes.provenanceHash
        };
      }

      case 'HF-SECTOR': {
        const secRes = R4AuthenticFeatureProvider.getSectorRegime(securityId, decisionDate);
        if (secRes.status !== 'READY' || !secRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${secRes.status}`, provenanceHash: secRes.provenanceHash };
        }
        const maxRank = (exp.parameters?.topSectorPct as number) || 50;
        const pass = secRes.value.sectorRank <= maxRank;
        return {
          isRetained: pass,
          reason: pass ? undefined : `SECTOR_RANK_${secRes.value.sectorRank}_EXCEEDS_${maxRank}`,
          score: secRes.value.sectorRank,
          provenanceHash: secRes.provenanceHash
        };
      }

      case 'HF-EVENT': {
        const evtRes = R4AuthenticFeatureProvider.getEarningsBlackout(securityId, decisionDate, (exp.parameters?.blackoutDays as number) || 5);
        if (evtRes.status !== 'READY' || !evtRes.value) {
          return { isRetained: false, reason: `PIT_FEATURE_UNAVAILABLE_${evtRes.status}`, provenanceHash: evtRes.provenanceHash };
        }
        const pass = !evtRes.value.isBlackout;
        return {
          isRetained: pass,
          reason: pass ? undefined : `EARNINGS_BLACKOUT_${evtRes.value.daysToEarnings}D_REMAINING`,
          score: pass ? 85 : 20,
          provenanceHash: evtRes.provenanceHash
        };
      }

      case 'HF-COMPOSITE': {
        const rsRes = R4AuthenticFeatureProvider.getMansfieldRS(securityId, decisionDate);
        const trendRes = R4AuthenticFeatureProvider.getEmaTrendStructure(securityId, decisionDate);
        const rvolRes = R4AuthenticFeatureProvider.getRelativeVolume(securityId, decisionDate);
        const qualRes = R4AuthenticFeatureProvider.getPiotroskiScore(securityId, decisionDate);

        if (rsRes.status !== 'READY' || trendRes.status !== 'READY' || rvolRes.status !== 'READY' || qualRes.status !== 'READY') {
          return { isRetained: false, reason: 'COMPOSITE_PIT_DATA_INSUFFICIENT' };
        }

        const score = Math.round(
          (rsRes.value!.percentileRank * 0.3) +
          ((trendRes.value!.isBullishAligned ? 90 : 30) * 0.3) +
          (Math.min(100, rvolRes.value!.relativeVolume * 33) * 0.2) +
          ((qualRes.value!.score * 12.5) * 0.2)
        );
        const minScore = (exp.parameters?.minScore as number) || 70;
        const pass = score >= minScore;
        return {
          isRetained: pass,
          reason: pass ? undefined : `COMPOSITE_SCORE_${score}_BELOW_${minScore}`,
          score,
          provenanceHash: crypto.createHash('sha256').update(`${rsRes.provenanceHash}:${trendRes.provenanceHash}:${rvolRes.provenanceHash}:${qualRes.provenanceHash}`).digest('hex')
        };
      }

      default:
        return { isRetained: true, score: 50 };
    }
  }

  public static replayExperiment(
    trades: any[],
    exp: R4Experiment
  ): { replayedTrades: R4ReplayedTrade[]; summary: CandidateReplaySummary } {
    const replayedTrades: R4ReplayedTrade[] = [];
    let grossSum = 0;
    let costSum = 0;
    let netSum = 0;
    let rSum = 0;
    let nomRSum = 0;
    let winsCount = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let turnoverRupees = 0;
    let frictionSavedSum = 0;
    let retainedCount = 0;

    for (const t of trades) {
      const evalRes = this.evaluateTrade(t, exp);

      let entry = Number(t.actualEntryPrice || t.entryPrice || 0);
      let exit = Number(t.actualExitPrice || t.exitPrice || 0);
      let qty = Number(t.quantity || 0);
      let cost = Number(t.totalCosts || t.costs || 0);
      let gross = (exit - entry) * qty;
      let net = gross - cost;

      if (evalRes.adjustedTrade) {
        entry = evalRes.adjustedTrade.entry;
        exit = evalRes.adjustedTrade.exit;
        gross = evalRes.adjustedTrade.gross;
        cost = evalRes.adjustedTrade.cost;
        net = evalRes.adjustedTrade.net;
        if (evalRes.adjustedTrade.frictionSavedINR) {
          frictionSavedSum += evalRes.adjustedTrade.frictionSavedINR;
        }
      }

      const stopPrice = Number(t.stopPrice || entry * 0.98);
      const riskPerShare = Math.max(0.01, entry - stopPrice);
      const r = riskPerShare > 0 ? net / (riskPerShare * qty) : typeof t.netR === 'number' ? t.netR : -0.11811;
      const nomR = entry * qty > 0 ? net / (0.01 * entry * qty) : 0;

      const rt: R4ReplayedTrade = {
        tradeId: t.tradeId,
        decisionId: t.decisionId || t.tradeId,
        strategyId: t.strategyId,
        securityId: t.securityId || t.symbol || 'UNKNOWN',
        decisionTimestamp: t.decisionTimestamp || t.entryDate || '',
        entry,
        exit,
        stop: stopPrice,
        quantity: qty,
        gross,
        cost,
        net,
        strategyStopRiskR: r,
        nominalOnePercentR: nomR,
        isRetained: evalRes.isRetained,
        suppressionReason: evalRes.reason,
        candidateScore: evalRes.score,
        provenanceHash: evalRes.provenanceHash
      };
      replayedTrades.push(rt);

      if (evalRes.isRetained) {
        retainedCount++;
        grossSum += gross;
        costSum += cost;
        netSum += net;
        rSum += r;
        nomRSum += nomR;
        turnoverRupees += (entry + exit) * qty;

        if (net > 0) {
          winsCount++;
          grossWins += net;
        } else {
          grossLosses += Math.abs(net);
        }
      }
    }

    const totalTrades = trades.length;
    const suppressedCount = totalTrades - retainedCount;
    const winRate = retainedCount > 0 ? (winsCount / retainedCount) * 100 : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;
    const meanR = retainedCount > 0 ? rSum / retainedCount : 0;
    const meanNomR = retainedCount > 0 ? nomRSum / retainedCount : 0;

    const summary: CandidateReplaySummary = {
      experimentId: exp.experimentId,
      candidateFamily: exp.candidateFamily,
      mode: exp.mode,
      totalBaselineTrades: totalTrades,
      retainedTrades: retainedCount,
      suppressedTrades: suppressedCount,
      retentionRatePct: Math.round((retainedCount / totalTrades) * 10000) / 100,
      grossPnL: Math.round(grossSum * 100) / 100,
      totalCosts: Math.round(costSum * 100) / 100,
      netPnL: Math.round(netSum * 100) / 100,
      meanStrategyStopRiskR: Math.round(meanR * 100000) / 100000,
      meanNominalOnePercentR: Math.round(meanNomR * 100000) / 100000,
      winRatePct: Math.round(winRate * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      turnoverRupees: Math.round(turnoverRupees * 100) / 100,
      frictionSavedINR: Math.round(frictionSavedSum * 100) / 100
    };

    return { replayedTrades, summary };
  }
}
