import { ResearchRun } from './ResearchRun';
import { EconomicReplayResult } from './CleanRoomEconomicReplay';
import { StopTheLineError } from './StopTheLineRegistry';

export interface WFOWindow {
  windowId: string;
  trainStart: string;
  trainEnd: string;
  validationStart: string;
  validationEnd: string;
  oosStart: string;
  oosEnd: string;
  purgeDays: number;
  embargoDays: number;
  configurationHashBeforeOOS: string;
}

export interface WFOResult {
  windowId: string;
  trainResult: EconomicReplayResult;
  validationResult: EconomicReplayResult;
  oosResult: EconomicReplayResult;
  configurationHashAfterOOS: string;
  isExtendedHoldout: boolean;
}

export class TrueWalkForwardEngine {
  public run(
    runContext: ResearchRun,
    windows: WFOWindow[]
  ): WFOResult[] {
    const results: WFOResult[] = [];

    for (const window of windows) {
      // In a real implementation, this would actually invoke the economic replay
      // constrained to the specific date ranges, and verify the configuration hashes
      // remain strictly unchanged during the transitions.
      
      const configurationHashAfterOOS = window.configurationHashBeforeOOS; // Stub, must be recomputed after OOS

      if (window.configurationHashBeforeOOS !== configurationHashAfterOOS) {
        throw new StopTheLineError('OOS_CONFIGURATION_MUTATION', `Configuration mutated during WFO window ${window.windowId}`);
      }

      // Check for extended holdout labelling
      const oosStart = new Date(window.oosStart).getTime();
      const oosEnd = new Date(window.oosEnd).getTime();
      const oosDurationMs = oosEnd - oosStart;
      const isExtendedHoldout = oosDurationMs > (4.5 * 30 * 24 * 60 * 60 * 1000); // Rough 4.5 months threshold

      results.push({
        windowId: window.windowId,
        trainResult: null as any, // Stub
        validationResult: null as any, // Stub
        oosResult: null as any, // Stub
        configurationHashAfterOOS,
        isExtendedHoldout
      });
    }

    return results;
  }
}
