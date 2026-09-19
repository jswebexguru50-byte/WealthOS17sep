import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");

function sha256File(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

describe("v6.3 Freeze Integrity Test Suite", () => {
  it("1. Dynamic byte calculation of trade ledger SHA-256 matches frozen baseline", () => {
    const ledgerPath = path.join(DATA_DIR, "v6.3_REAL_trade_identity_ledger.jsonl");
    const computedSha = sha256File(ledgerPath);

    expect(computedSha).toBe(
      "035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485"
    );
  });

  it("2. Canonical trade ledger reconciles line-by-line to exactly 19 trades (S1=16, S3=3)", () => {
    const ledgerPath = path.join(DATA_DIR, "v6.3_REAL_trade_identity_ledger.jsonl");
    const lines = fs
      .readFileSync(ledgerPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);

    const records = lines.map((line) => JSON.parse(line));
    expect(records.length).toBe(19);

    const counts = new Map<string, number>();
    for (const record of records) {
      const id = record.strategyId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    expect(counts.get("S1_MOMENTUM_BREAKOUT")).toBe(16);
    expect(counts.get("S21")).toBe(3);

    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(19);
  });

  it("3. Frozen production strategy & execution files remain 100% hash stable", () => {
    const expectedHashes: Record<string, string> = {
      "src/server/services/PureTechnicalStrategiesEngine.ts":
        "825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3",
      "src/server/services/NewTechnicalStrategiesEngine.ts":
        "78415ba3c74ca6a9cc2fcc96d2e54ba871e9bca73fc6e078570c412781b1d354",
      "src/server/services/SignalQualityOverlay.ts":
        "c41cddb152c150bea932a8b9bd8fcc6ea01a03a2ba030a723789aaada5c17452",
      "src/server/services/CapitalProtectionEngine.ts":
        "63b8317889f5a60e9462f883e89acb57fe99e819935ec8f7b30036ecfe4ed753",
      "src/server/services/StrategyParameterConfig.ts":
        "901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b",
      "src/server/services/UpstoxIntradayIngestor.ts":
        "0f1c96d0e0c704672517f378990e17facdced7bfbf359daf9c6f37333be1b151",
    };

    for (const [relPath, expectedHash] of Object.entries(expectedHashes)) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const actualHash = sha256File(fullPath);
      expect(actualHash).toBe(expectedHash);
    }
  });

  it("4. Canonical trade identity invariants hold for every record", () => {
    const ledgerPath = path.join(DATA_DIR, "v6.3_REAL_trade_identity_ledger.jsonl");
    const records = fs
      .readFileSync(ledgerPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const tradeIds = new Set<string>();

    for (const record of records) {
      expect(record.tradeId).toBeDefined();
      expect(typeof record.tradeId).toBe("string");
      expect(tradeIds.has(record.tradeId)).toBe(false);
      tradeIds.add(record.tradeId);

      expect(record.signalDate).toBeDefined();
      expect(record.entryDate).toBeDefined();
      expect(record.signalPrice).toBeGreaterThan(0);
      expect(record.rawEntryPrice).toBeGreaterThan(0);
      expect(record.actualEntryPrice).toBeGreaterThan(0);

      expect(Number.isNaN(record.signalPrice)).toBe(false);
      expect(Number.isNaN(record.rawEntryPrice)).toBe(false);
      expect(Number.isNaN(record.actualEntryPrice)).toBe(false);

      // Strict next-session execution constraint: signalDate < entryDate
      expect(new Date(record.signalDate).getTime()).toBeLessThan(
        new Date(record.entryDate).getTime()
      );

      // Verify execution provenance tags
      expect(record.provenance).toContain("REAL_HISTORICAL");
      expect(record.provenance).toContain("NEXT_BAR_OPEN");
    }
  });
});
