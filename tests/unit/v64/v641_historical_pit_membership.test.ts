import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Historical PIT Membership Source Audit Unit Tests", () => {
  it("1. Membership source inventory identifies source findings and flags dynamic PIT insufficiency", () => {
    const file = path.join(V64_DIR, "v641_membership_source_inventory.json");
    expect(fs.existsSync(file)).toBe(true);

    const inventory = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(inventory.targetIndex).toBe("NIFTY_500");
    expect(inventory.overallSourceStatus).toBe("DATA_INSUFFICIENT_FOR_500_SYMBOL_DYNAMIC_PIT");
    expect(inventory.auditedSources.length).toBeGreaterThan(0);
  });
});
