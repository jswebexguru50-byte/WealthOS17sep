import { CanonicalResearchInput } from './CanonicalResearchInput';
import { FrozenVerificationResult } from './FrozenControlValidator';
import { ExperimentDefinition } from './ExperimentRegistry';
import { DeterministicRunContext } from './DeterministicRunContext';

export interface ExperimentRegistrySnapshot {
  experiments: Record<string, ExperimentDefinition>;
}

export interface ResearchRun {
  runId: string;
  inputs: CanonicalResearchInput;
  frozenControls: FrozenVerificationResult;
  experimentRegistry: ExperimentRegistrySnapshot;
  deterministicContext: DeterministicRunContext;
}
