import { EnrichedImmutableSignal } from './FastTrackTypes.js';

export interface B1SampleConfig {
    inclusionRules: string[];
    exclusionRules: string[];
    outcomeHorizon: number;
    dataStatusEligibility: string[];
    pitRequirements: string[];
    caRequirements: string[];
    timestampRequirements: string[];
    sampleSufficiencyCriteria: any;
    representativenessDiagnostics: any;
    stoppingRules: string[];
}

export class B1SampleBuilder {
    constructor(private config: B1SampleConfig) {}

    public constructSample(canonicalLedger: any, enrichedSignals: EnrichedImmutableSignal[], preregistration: any) {
        throw new Error("B1_BLOCKED_DELIVERY_2_CONTRACT_ONLY");
    }
}
