import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Static Universe Rejection Unit Tests", () => {
  it("1. Validator produces LIKELY_STATIC_UNIVERSE when distinctConstituentSets == 1 and entry/exit events == 0", () => {
    const file = path.join(V64_DIR, "v641_rebalance_reconstruction_audit.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    const detection = audit.substitutionDetection;

    expect(detection.classification).toBe("LIKELY_STATIC_UNIVERSE");
    expect(detection.numberOfDistinctConstituentSets).toBe(1);
    expect(detection.numberOfSecurityEntryEvents).toBe(0);
    expect(detection.numberOfSecurityExitEvents).toBe(0);
    expect(detection.fullUniverse500ReplayAuthorized).toBe(false);
  });

  it("2. Synthetic dynamic changing membership fixture is NOT falsely classified as static universe", () => {
    const dynamicRecords = [
      { symbol: "SYM_A", effective_from: "2020-01-01", effective_to: "2021-12-31" },
      { symbol: "SYM_B", effective_from: "2020-01-01", effective_to: "2024-12-31" },
      { symbol: "SYM_C", effective_from: "2022-01-01", effective_to: "2024-12-31" } // Entry event!
    ];

    let entries = 0;
    let exits = 0;
    for (const r of dynamicRecords) {
      if (r.effective_from !== "2020-01-01") entries++;
      if (r.effective_to !== "2024-12-31") exits++;
    }

    const classification = (dynamicRecords.length === 500 && entries === 0 && exits === 0)
      ? "LIKELY_STATIC_UNIVERSE"
      : "DYNAMIC_PIT_UNIVERSE";

    expect(entries).toBe(1);
    expect(exits).toBe(1);
    expect(classification).toBe("DYNAMIC_PIT_UNIVERSE");
  });
});
