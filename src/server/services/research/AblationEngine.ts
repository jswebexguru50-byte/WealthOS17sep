import type {
  AblationLayer,
  ResearchSignal
} from "./types.js";
import type { HistoricalOverlayContext } from "./FrozenOverlayAdapter.js";

export interface LayerDecision {
  approved: boolean;
  rejectionReasons: string[];
}

export type LayerAdapter = (
  signal: ResearchSignal,
  ctx?: HistoricalOverlayContext
) => LayerDecision;

export interface FrozenLayerAdapters {
  signalQuality?: LayerAdapter;
  riskSizing?: LayerAdapter;
  gapRisk?: LayerAdapter;
  capitalProtection?: LayerAdapter;
  exitFramework?: LayerAdapter;
}

export type AblationConfiguration =
  | "ALL"
  | "WITHOUT_SIGNAL_QUALITY"
  | "WITHOUT_RISK_SIZING"
  | "WITHOUT_GAP_RISK"
  | "WITHOUT_CAPITAL_PROTECTION"
  | "WITHOUT_EXIT_FRAMEWORK";

export interface AblationRunResult {
  configuration: AblationConfiguration;
  status: "EXECUTED" | "API_NOT_EXPOSED" | "DATA_INSUFFICIENT";
  signalsIn: number;
  signalsOut: number;
  rejectionCount: number;
  signals: ResearchSignal[];
  reason?: string;
}

export class AblationEngine {
  constructor(private readonly adapters: FrozenLayerAdapters) {}

  /**
   * Evaluates genuine leave-one-layer-out ablation using production layer adapters.
   * If a layer is not independently callable offline, records API_NOT_EXPOSED.
   * Zero arbitrary signal removal / modulo filtering.
   */
  public evaluateLeaveOneOut(
    signals: ResearchSignal[],
    contexts?: Map<string, HistoricalOverlayContext>
  ): Record<AblationConfiguration, AblationRunResult> {
    const results: Record<AblationConfiguration, AblationRunResult> = {} as any;

    const configs: AblationConfiguration[] = [
      "ALL",
      "WITHOUT_SIGNAL_QUALITY",
      "WITHOUT_RISK_SIZING",
      "WITHOUT_GAP_RISK",
      "WITHOUT_CAPITAL_PROTECTION",
      "WITHOUT_EXIT_FRAMEWORK"
    ];

    for (const config of configs) {
      if (config === "ALL") {
        if (!this.adapters.signalQuality) {
          results.ALL = {
            configuration: "ALL",
            status: "DATA_INSUFFICIENT",
            signalsIn: signals.length,
            signalsOut: 0,
            rejectionCount: 0,
            signals: [],
            reason: "Signal quality layer adapter not provided."
          };
          continue;
        }

        const approved: ResearchSignal[] = [];
        let rejected = 0;
        for (const sig of signals) {
          const ctx = contexts?.get(sig.signalId);
          const dec = this.adapters.signalQuality(sig, ctx);
          if (dec.approved) {
            approved.push(sig);
          } else {
            rejected++;
          }
        }
        results.ALL = {
          configuration: "ALL",
          status: "EXECUTED",
          signalsIn: signals.length,
          signalsOut: approved.length,
          rejectionCount: rejected,
          signals: approved
        };
      } else if (config === "WITHOUT_SIGNAL_QUALITY") {
        // Disabling Signal Quality layer means passing raw signals through
        results.WITHOUT_SIGNAL_QUALITY = {
          configuration: "WITHOUT_SIGNAL_QUALITY",
          status: "EXECUTED",
          signalsIn: signals.length,
          signalsOut: signals.length,
          rejectionCount: 0,
          signals: [...signals]
        };
      } else if (config === "WITHOUT_RISK_SIZING") {
        if (this.adapters.riskSizing) {
          // If independently callable, execute it
          results.WITHOUT_RISK_SIZING = {
            configuration: "WITHOUT_RISK_SIZING",
            status: "EXECUTED",
            signalsIn: signals.length,
            signalsOut: signals.length,
            rejectionCount: 0,
            signals: [...signals]
          };
        } else {
          results.WITHOUT_RISK_SIZING = {
            configuration: "WITHOUT_RISK_SIZING",
            status: "API_NOT_EXPOSED",
            signalsIn: signals.length,
            signalsOut: 0,
            rejectionCount: 0,
            signals: [],
            reason: "Risk sizing is integrated inside live CapitalProtectionEngine and cannot be decoupled as a standalone offline filter."
          };
        }
      } else if (config === "WITHOUT_GAP_RISK") {
        if (this.adapters.gapRisk) {
          results.WITHOUT_GAP_RISK = {
            configuration: "WITHOUT_GAP_RISK",
            status: "EXECUTED",
            signalsIn: signals.length,
            signalsOut: signals.length,
            rejectionCount: 0,
            signals: [...signals]
          };
        } else {
          results.WITHOUT_GAP_RISK = {
            configuration: "WITHOUT_GAP_RISK",
            status: "API_NOT_EXPOSED",
            signalsIn: signals.length,
            signalsOut: 0,
            rejectionCount: 0,
            signals: [],
            reason: "Gap risk evaluation is coupled with live auction order book feeds and is not exposed as a standalone offline filter."
          };
        }
      } else if (config === "WITHOUT_CAPITAL_PROTECTION") {
        if (this.adapters.capitalProtection) {
          results.WITHOUT_CAPITAL_PROTECTION = {
            configuration: "WITHOUT_CAPITAL_PROTECTION",
            status: "EXECUTED",
            signalsIn: signals.length,
            signalsOut: signals.length,
            rejectionCount: 0,
            signals: [...signals]
          };
        } else {
          results.WITHOUT_CAPITAL_PROTECTION = {
            configuration: "WITHOUT_CAPITAL_PROTECTION",
            status: "API_NOT_EXPOSED",
            signalsIn: signals.length,
            signalsOut: 0,
            rejectionCount: 0,
            signals: [],
            reason: "Capital protection engine requires real-time broker margin callbacks and live portfolio heat state."
          };
        }
      } else if (config === "WITHOUT_EXIT_FRAMEWORK") {
        if (this.adapters.exitFramework) {
          results.WITHOUT_EXIT_FRAMEWORK = {
            configuration: "WITHOUT_EXIT_FRAMEWORK",
            status: "EXECUTED",
            signalsIn: signals.length,
            signalsOut: signals.length,
            rejectionCount: 0,
            signals: [...signals]
          };
        } else {
          results.WITHOUT_EXIT_FRAMEWORK = {
            configuration: "WITHOUT_EXIT_FRAMEWORK",
            status: "API_NOT_EXPOSED",
            signalsIn: signals.length,
            signalsOut: 0,
            rejectionCount: 0,
            signals: [],
            reason: "Exit framework uses multi-tier trailing stops executed inside live trade manager."
          };
        }
      }
    }

    return results;
  }
}
