import { ResearchExperiment } from './ResearchExperimentRegistry';
import { ResearchConfiguration } from './ResearchConfigurationRegistry';
import { PREDECLARED_HYPOTHESES } from './PredeclaredCandidateDefinitions';

export function generatePredeclaredExperimentsAndConfigs(): {
  experiments: ResearchExperiment[];
  configurations: ResearchConfiguration[];
} {
  const experiments: ResearchExperiment[] = [];
  const configurations: ResearchConfiguration[] = [];
  const baselineId = 'R2_CANONICAL_BASELINE_REPLAY_V65_ED18F3B9A403';

  for (const h of PREDECLARED_HYPOTHESES) {
    const expId = `EXP-${h.hypothesisId.replace('H-', '')}-A`;
    const cfgId = `CFG-${h.hypothesisId.replace('H-', '')}-A`;

    experiments.push({
      experimentId: expId,
      hypothesisId: h.hypothesisId,
      parentBaselineId: baselineId,
      ablationType: 'BASELINE_PLUS_A',
      configurationIds: [cfgId],
      status: 'PREDECLARED',
      predeclaredAt: '2026-09-18T13:00:00.000Z',
      oosLocked: true,
      experimentHash: ''
    });

    configurations.push({
      configurationId: cfgId,
      experimentId: expId,
      hypothesisId: h.hypothesisId,
      parameters: h.allowedParameters,
      parameterSource: 'ESTABLISHED_METHOD',
      status: 'PREDECLARED',
      createdAt: '2026-09-18T13:00:00.000Z',
      configurationHash: '',
      oosLocked: true
    });
  }

  // Predeclared multi-filter combinations
  const comboExp1: ResearchExperiment = {
    experimentId: 'EXP-RS-TREND-COMBO-AB',
    hypothesisId: 'H-RS-001',
    parentBaselineId: baselineId,
    ablationType: 'BASELINE_PLUS_AB',
    configurationIds: ['CFG-RS-TREND-COMBO-AB'],
    status: 'PREDECLARED',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    oosLocked: true,
    experimentHash: ''
  };
  const comboCfg1: ResearchConfiguration = {
    configurationId: 'CFG-RS-TREND-COMBO-AB',
    experimentId: 'EXP-RS-TREND-COMBO-AB',
    hypothesisId: 'H-RS-001',
    parameters: { rsLookback: 63, fastWeeklyEma: 10, slowWeeklyEma: 30 },
    parameterSource: 'ESTABLISHED_METHOD',
    status: 'PREDECLARED',
    createdAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    oosLocked: true
  };
  experiments.push(comboExp1);
  configurations.push(comboCfg1);

  const comboExp2: ResearchExperiment = {
    experimentId: 'EXP-VCP-VOL-COMBO-AB',
    hypothesisId: 'H-VCP-001',
    parentBaselineId: baselineId,
    ablationType: 'BASELINE_PLUS_AB',
    configurationIds: ['CFG-VCP-VOL-COMBO-AB'],
    status: 'PREDECLARED',
    predeclaredAt: '2026-09-18T13:00:00.000Z',
    oosLocked: true,
    experimentHash: ''
  };
  const comboCfg2: ResearchConfiguration = {
    configurationId: 'CFG-VCP-VOL-COMBO-AB',
    experimentId: 'EXP-VCP-VOL-COMBO-AB',
    hypothesisId: 'H-VCP-001',
    parameters: { contractionRatioThreshold: 0.65, advMultiplierThreshold: 1.75 },
    parameterSource: 'ESTABLISHED_METHOD',
    status: 'PREDECLARED',
    createdAt: '2026-09-18T13:00:00.000Z',
    configurationHash: '',
    oosLocked: true
  };
  experiments.push(comboExp2);
  configurations.push(comboCfg2);

  return { experiments, configurations };
}
