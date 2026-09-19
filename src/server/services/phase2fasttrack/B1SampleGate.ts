export class B1SampleGate {
    public evaluateGate(sampleStats: any): "VERIFIED" | "VERIFIED_WITH_LIMITATIONS" | "BLOCKED" | "NOT_STARTED" {
        throw new Error("B1_BLOCKED_DELIVERY_2_CONTRACT_ONLY");
    }

    public computeB1Gate(evidence: any) {
        throw new Error("B1_BLOCKED_DELIVERY_2_CONTRACT_ONLY");
    }
}
