import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface R43RegistryEntry {
  experimentId: string;
  candidate: 'BASELINE' | 'L2' | 'L4' | 'L5' | 'L2_L4' | 'L2_L5' | 'L4_L5' | 'L2_L4_L5';
  classification: 'CONFIRMATORY' | 'SENSITIVITY' | 'EXPLORATORY';
  researchQuestion: string;
  parameters: Record<string, any>;
  preRegisteredTimestamp: string;
}

export interface R43RegistrySnapshot {
  registryVersion: string;
  declaredAt: string;
  createdBeforeExecution: boolean;
  totalExperiments: number;
  registryHash: string;
  experiments: R43RegistryEntry[];
}

export class R43ExperimentRegistry {
  public static createRegistry(): R43RegistrySnapshot {
    const timestamp = '2026-09-18T19:45:00.000Z';
    const experiments: R43RegistryEntry[] = [];

    // RQ1 Cost Sensitivity (0.5x to 3.0x)
    const costMults = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
    for (const c of costMults) {
      for (const cand of ['BASELINE', 'L2', 'L4', 'L5']) {
        experiments.push({
          experimentId: `R43-COST-${cand}-${c}X`,
          candidate: cand as any,
          classification: 'SENSITIVITY',
          researchQuestion: 'RQ1_COST_ROBUSTNESS',
          parameters: { costMultiplier: c },
          preRegisteredTimestamp: timestamp
        });
      }
    }

    // RQ2 Slippage Sensitivity (0 to 50 bps)
    const slippages = [0, 5, 10, 15, 20, 30, 40, 50];
    for (const s of slippages) {
      for (const cand of ['L2', 'L4']) {
        experiments.push({
          experimentId: `R43-SLIP-${cand}-${s}BPS`,
          candidate: cand as any,
          classification: 'SENSITIVITY',
          researchQuestion: 'RQ2_SLIPPAGE_ROBUSTNESS',
          parameters: { slippageBps: s },
          preRegisteredTimestamp: timestamp
        });
      }
    }

    // RQ3 Capacity Sensitivity (₹0.25Cr to ₹20Cr)
    const capScales = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 15.0, 20.0];
    for (const cap of capScales) {
      for (const cand of ['L2', 'L4']) {
        experiments.push({
          experimentId: `R43-CAP-${cand}-${cap}CR`,
          candidate: cand as any,
          classification: 'SENSITIVITY',
          researchQuestion: 'RQ3_CAPACITY_ROBUSTNESS',
          parameters: { orderScaleCr: cap },
          preRegisteredTimestamp: timestamp
        });
      }
    }

    // RQ4 Right-Tail Dependence
    const tailScenarios = ['FULL', 'EXCLUDE_TOP_0.1%', 'EXCLUDE_TOP_0.5%', 'EXCLUDE_TOP_1%', 'EXCLUDE_TOP_2%', 'EXCLUDE_TOP_5%', 'WINSORIZED_1%', 'WINSORIZED_2%'];
    for (const ts of tailScenarios) {
      for (const cand of ['L2', 'L4']) {
        experiments.push({
          experimentId: `R43-TAIL-${cand}-${ts}`,
          candidate: cand as any,
          classification: 'SENSITIVITY',
          researchQuestion: 'RQ4_RIGHT_TAIL_DEPENDENCE',
          parameters: { tailScenario: ts },
          preRegisteredTimestamp: timestamp
        });
      }
    }

    // RQ7 Parameter Sensitivity (L2: Hold 3-7, L4: EMA 15-25)
    for (const h of [3, 4, 5, 6, 7]) {
      experiments.push({
        experimentId: `R43-PARAM-L2-HOLD${h}`,
        candidate: 'L2',
        classification: 'SENSITIVITY',
        researchQuestion: 'RQ7_PARAMETER_SENSITIVITY',
        parameters: { minHoldSessions: h },
        preRegisteredTimestamp: timestamp
      });
    }

    for (const ema of [15, 20, 25]) {
      experiments.push({
        experimentId: `R43-PARAM-L4-EMA${ema}`,
        candidate: 'L4',
        classification: 'SENSITIVITY',
        researchQuestion: 'RQ7_PARAMETER_SENSITIVITY',
        parameters: { emaPeriod: ema },
        preRegisteredTimestamp: timestamp
      });
    }

    // RQ12 Strategy Interaction
    const combos = ['BASELINE', 'BASELINE+L2', 'BASELINE+L4', 'BASELINE+L5', 'L2+L4', 'L2+L5', 'L4+L5', 'L2+L4+L5'];
    for (const cb of combos) {
      experiments.push({
        experimentId: `R43-COMBO-${cb}`,
        candidate: cb.replace('BASELINE+', '') as any,
        classification: 'CONFIRMATORY',
        researchQuestion: 'RQ12_LIFECYCLE_INTERACTION',
        parameters: { interaction: cb },
        preRegisteredTimestamp: timestamp
      });
    }

    const regContent = JSON.stringify(experiments);
    const regHash = crypto.createHash('sha256').update(regContent).digest('hex');

    return {
      registryVersion: 'R43.1',
      declaredAt: timestamp,
      createdBeforeExecution: true,
      totalExperiments: experiments.length,
      registryHash: regHash,
      experiments
    };
  }
}
