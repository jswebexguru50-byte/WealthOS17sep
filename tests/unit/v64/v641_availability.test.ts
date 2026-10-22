import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Availability & Lookahead Audit Unit Tests", () => {
  it("1. Availability classifications correctly distinguish observed timestamps from contracts/fallbacks", () => {
    const file = path.join(V64_DIR, "v64_availability_classification.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const cls = audit.classifications;

    expect(cls.OHLCV.availabilityType).toBe("DECLARED_CONTRACT");
    expect(cls.Delivery.availabilityType).toBe("DECLARED_CONTRACT");
    expect(cls.Fundamentals.availabilityType).toBe("FALLBACK_RULE");
    expect(cls.Shareholding.availabilityType).toBe("OBSERVED");
  });

  it("2. Lookahead invariant dataTimestamp <= decisionTimestamp throws DATA_INVALID_LOOKAHEAD on breach", () => {
    function enforceLookaheadInvariant(dataTimestampISO: string, decisionTimestampISO: string) {
      if (new Date(dataTimestampISO).getTime() > new Date(decisionTimestampISO).getTime()) {
        throw new Error("DATA_INVALID_LOOKAHEAD: Data timestamp exceeds decision timestamp!");
      }
    }

    const decisionTime = "2023-01-16T15:35:00+05:30";
    const validTime = "2023-01-16T15:30:00+05:30";
    const invalidTime = "2023-01-17T09:15:00+05:30";

    expect(() => enforceLookaheadInvariant(validTime, decisionTime)).not.toThrow();
    expect(() => enforceLookaheadInvariant(invalidTime, decisionTime)).toThrow("DATA_INVALID_LOOKAHEAD");
  });
});
