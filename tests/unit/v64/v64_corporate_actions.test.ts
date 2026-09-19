import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Corporate Actions Audit Unit Tests", () => {
  it("1. Corporate actions audit verifies 0 double adjustments and valid sequencing pipeline", () => {
    const file = path.join(V64_DIR, "v64_corporate_action_audit.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(audit.status).toBe("PASS");
    expect(audit.doubleAdjustmentCheck).toBe("VERIFIED_NO_DOUBLE_ADJUSTMENT");
    expect(audit.anomaliesDetected).toBe(0);
    expect(audit.unresolvedEvents).toBe(0);
    expect(audit.sequencingPipeline).toContain("raw_event");
    expect(audit.sequencingPipeline).toContain("price_adjustment");
  });
});
