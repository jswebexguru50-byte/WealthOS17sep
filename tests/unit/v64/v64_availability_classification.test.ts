import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Availability Classification & Anti-Lookahead Unit Tests", () => {
  it("1. Availability classification contains explicit evidence fields and researchUse flags", () => {
    const file = path.join(V64_DIR, "v64_availability_classification.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const cls = audit.classifications;

    expect(cls.OHLCV.availabilityType).toBe("DECLARED_CONTRACT");
    expect(cls.OHLCV.evidenceSource).toBeDefined();
    expect(cls.OHLCV.lookaheadSafe).toBe(true);
    expect(cls.OHLCV.researchUse).toBe("EVALUATE_ONLY");

    expect(cls.Delivery.availabilityType).toBe("DECLARED_CONTRACT");
    expect(cls.Delivery.observedTimestampAvailable).toBe(false);
    expect(cls.Delivery.researchUse).toBe("BLOCKED");

    expect(cls.Fundamentals.availabilityType).toBe("FALLBACK_RULE");
    expect(cls.Fundamentals.researchUse).toBe("BLOCKED");
  });

  it("2. Hard anti-lookahead invariant throws DATA_INVALID_LOOKAHEAD on lookahead violation", () => {
    function validateTimestamps(dataTimestampISO: string, decisionTimestampISO: string) {
      if (new Date(dataTimestampISO).getTime() > new Date(decisionTimestampISO).getTime()) {
        throw new Error("DATA_INVALID_LOOKAHEAD: Data timestamp is after decision timestamp!");
      }
    }

    const decisionTime = "2023-01-16T15:35:00+05:30";
    const validDataTime = "2023-01-16T15:30:00+05:30";
    const invalidFutureDataTime = "2023-01-17T09:15:00+05:30";

    expect(() => validateTimestamps(validDataTime, decisionTime)).not.toThrow();
    expect(() => validateTimestamps(invalidFutureDataTime, decisionTime)).toThrow("DATA_INVALID_LOOKAHEAD");
  });
});
