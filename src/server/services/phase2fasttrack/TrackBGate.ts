import fs from 'fs';
import path from 'path';
import { CP21Coordinator } from './CP21Coordinator.js';
export interface GateToken {
    gate: "CP2.1" | "B1";
    decision: "VERIFIED";
    evidenceHash: string;
    generatedAt: string;
    expiresAt?: string;
    tokenHash: string;
}

export class TrackBGate {
    private b1Authorized: boolean = false;
    private b2Authorized: boolean = false;

    constructor(private coordinator: CP21Coordinator) {}

    public evaluateGate(): "CP2.1_VERIFIED" | "CP2.1_VERIFIED_WITH_LIMITATIONS" | "CP2.1_BLOCKED" | "CP2.1_FAILED" {
        const state = this.coordinator.getState;
        let allTestsPassed = true;
        let hasBlockers = state.blockers.length > 0;
        let hasLimitations = state.outcomes.dataInsufficient > 0 || state.outcomes.caUnresolved > 0;

        for (const [cp, status] of Object.entries(state.checkpoints)) {
            if (status !== 'PASS') {
                allTestsPassed = false;
            }
        }

        if (state.canonical.expected !== state.canonical.actual || !state.enrichment.oneToOne) {
            return "CP2.1_FAILED";
        }

        if (!allTestsPassed || hasBlockers) {
            return "CP2.1_BLOCKED";
        }

        if (hasLimitations) {
            return "CP2.1_VERIFIED_WITH_LIMITATIONS";
        }

        return "CP2.1_VERIFIED";
    }

    public runGate(): void {
        console.log(`\n====================================================`);
        console.log(`[GATE] Evaluating Track B Gate Conditions...`);
        const result = this.evaluateGate();
        console.log(`[GATE] Decision: ${result}`);

        if (result === "CP2.1_VERIFIED" || result === "CP2.1_VERIFIED_WITH_LIMITATIONS") {
            console.log(`[GATE] B1 is now AUTHORIZED.`);
            this.b1Authorized = true;
            this.coordinator.getState.b1Status = "OPEN";
            this.coordinator.saveState();
        } else {
            console.log(`[GATE] B1 remains BLOCKED.`);
            process.exit(1);
        }
        console.log(`====================================================\n`);
    }

    public authorizeB1(cp21Token: GateToken): boolean {
        if (!cp21Token || cp21Token.gate !== "CP2.1" || cp21Token.decision !== "VERIFIED") {
            throw new Error("B1_BLOCKED_INVALID_CP21_TOKEN");
        }
        // Delivery 2 constraint
        if (!this.b1Authorized) {
            throw new Error("B1_BLOCKED_DELIVERY_2_CONTRACT_ONLY");
        }
        return this.b1Authorized;
    }

    public authorizeB2(cp21Token: GateToken, b1Token: GateToken): boolean {
        if (!cp21Token || cp21Token.gate !== "CP2.1" || cp21Token.decision !== "VERIFIED") {
            throw new Error("B2_BLOCKED_INVALID_CP21_TOKEN");
        }
        if (!b1Token || b1Token.gate !== "B1" || b1Token.decision !== "VERIFIED") {
            throw new Error("B2_BLOCKED_B1_SAMPLE_GATE_NOT_PASSED");
        }
        if (cp21Token.evidenceHash !== b1Token.evidenceHash) {
            throw new Error("B2_BLOCKED_EVIDENCE_HASH_MISMATCH");
        }
        
        return this.b2Authorized;
    }

    public setB2Authorized(authorized: boolean) {
        this.b2Authorized = authorized;
    }
}
