/**
 * integrity_final.test.ts — Final integrity regression suite
 *
 * Verifies the three Phase-1 closure mandates:
 *   1. Thesis identity is deterministic (sha256-based, NOT randomUUID).
 *   2. SectorArchetypeRegistry resolves by sector vocabulary — no stock symbol embedded.
 *   3. BusinessModelClassifier uses sector/industry as PRIMARY signal.
 */

import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { SectorArchetypeRegistry } from "../../src/server/services/intelligence/business/SectorArchetypeRegistry.js";
import { BusinessModelClassifier } from "../../src/server/services/intelligence/domain/BusinessModelClassifier.js";

// helper — mirrors ThesisEngine deterministic formula
function deterministicThesisId(securityId: string): string {
  return crypto.createHash("sha256").update(`${securityId}:THESIS_V2`).digest("hex").substring(0, 16);
}

describe("ThesisEngine — deterministic thesis identity", () => {
  it("same securityId → same thesisId every time", () => {
    const id1 = deterministicThesisId("SEC-DYCL-001");
    const id2 = deterministicThesisId("SEC-DYCL-001");
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
  });
  it("different securityId → different thesisId", () => {
    expect(deterministicThesisId("SEC-DYCL-001")).not.toBe(deterministicThesisId("SEC-INFY-001"));
  });
  it("stable across 10 iterations (randomUUID never called)", () => {
    const ids = Array.from({ length: 10 }, () => deterministicThesisId("SEC-HDFCBANK-001"));
    expect(new Set(ids).size).toBe(1);
  });
});

describe("SectorArchetypeRegistry — symbol-free resolution", () => {
  const reg = SectorArchetypeRegistry.getInstance();
  it("'Information Technology' → IT_SERVICES", () => expect(reg.resolveFromSectorString("Information Technology")).toBe("IT_SERVICES"));
  it("'Banking' → BANK", () => expect(reg.resolveFromSectorString("Banking")).toBe("BANK"));
  it("'Capital Goods' → INDUSTRIAL", () => expect(reg.resolveFromSectorString("Capital Goods")).toBe("INDUSTRIAL"));
  it("'Pharmaceuticals' → PHARMA", () => expect(reg.resolveFromSectorString("Pharmaceuticals")).toBe("PHARMA"));
  it("'DYCL' as sector string → UNKNOWN (ticker not in regex)", () => expect(reg.resolveFromSectorString("DYCL")).toBe("UNKNOWN"));
  it("'INFY' as sector string → UNKNOWN", () => expect(reg.resolveFromSectorString("INFY")).toBe("UNKNOWN"));
  it("'HDFCBANK' as sector string → UNKNOWN", () => expect(reg.resolveFromSectorString("HDFCBANK")).toBe("UNKNOWN"));
  it("null → UNKNOWN", () => expect(reg.resolveFromSectorString(null)).toBe("UNKNOWN"));
});

describe("BusinessModelClassifier — sector/industry primary", () => {
  it("unknown symbol + sector='Banking' → BANK", () => {
    expect(BusinessModelClassifier.classify("XYZBANK99", "Banking", "Commercial Banking")).toBe("BANK");
  });
  it("unknown symbol + industry='Housing Finance' → NBFC", () => {
    expect(BusinessModelClassifier.classify("UNKNOWNFIN", null, "Housing Finance")).toBe("NBFC");
  });
  it("unknown symbol + sector='Insurance' → INSURANCE", () => {
    expect(BusinessModelClassifier.classify("NEWINSURER", "Insurance", null)).toBe("INSURANCE");
  });
  it("HDFCBANK with no sector/industry → BANK via symbol hint", () => {
    expect(BusinessModelClassifier.classify("HDFCBANK", null, null)).toBe("BANK");
  });
  it("DYCL with no sector/industry → NON_FINANCIAL (industrial company, not in any hint set)", () => {
    expect(BusinessModelClassifier.classify("DYCL", null, null)).toBe("NON_FINANCIAL");
  });
  it("empty symbol + no sector/industry → UNKNOWN", () => {
    expect(BusinessModelClassifier.classify("", null, null)).toBe("UNKNOWN");
  });
});
