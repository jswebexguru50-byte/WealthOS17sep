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
        "a65639c8a5c00f1f5a911e8b0a6ddc7046e8c05cbc2a72ded47a3817a59b119a",
      "src/server/services/NewTechnicalStrategiesEngine.ts":
        "74cf1b2410bb3b24b60ea4c713086ffd588df79f4f831d8b27015b4bb423eab1",
      "src/server/services/SignalQualityOverlay.ts":
        "12e95b48729dc18252838a8e44cdf70aeac3891a4a1a20116fa290dd101a9dfa",
      "src/server/services/CapitalProtectionEngine.ts":
        "126a8c197eca22a702d689823dcccbb207ee87ec20e386078e104a77488385e2",
      "src/server/services/StrategyParameterConfig.ts":
        "d04a8a653e2950516d7feb5838f024af89e8fc8747fb0052ffd26dd1e5083b02",
      "src/server/services/UpstoxIntradayIngestor.ts":
        "632d0ca4e20c0bb7e2991537b09b672853ab47c6c79a607228555ca3723192d0",
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
