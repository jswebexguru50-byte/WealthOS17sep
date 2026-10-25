import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();

function sha256File(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

describe("v6.4.1 Freeze Guard Unit Tests", () => {
  it("1. v6.3 ledger SHA-256 matches actual bytes on disk", () => {
    const ledgerPath = path.join(ROOT_DIR, "data", "v6.3_REAL_trade_identity_ledger.jsonl");
    const computedSha = sha256File(ledgerPath);
    expect(computedSha).toBe("035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485");
  });

  it("2. All 6 frozen production strategy and execution files remain 100% hash stable", () => {
    const frozenFiles: Record<string, string> = {
      "src/server/services/PureTechnicalStrategiesEngine.ts": "a65639c8a5c00f1f5a911e8b0a6ddc7046e8c05cbc2a72ded47a3817a59b119a",
      "src/server/services/NewTechnicalStrategiesEngine.ts": "74cf1b2410bb3b24b60ea4c713086ffd588df79f4f831d8b27015b4bb423eab1",
      "src/server/services/SignalQualityOverlay.ts": "12e95b48729dc18252838a8e44cdf70aeac3891a4a1a20116fa290dd101a9dfa",
      "src/server/services/CapitalProtectionEngine.ts": "126a8c197eca22a702d689823dcccbb207ee87ec20e386078e104a77488385e2",
      "src/server/services/StrategyParameterConfig.ts": "d04a8a653e2950516d7feb5838f024af89e8fc8747fb0052ffd26dd1e5083b02",
      "src/server/services/UpstoxIntradayIngestor.ts": "632d0ca4e20c0bb7e2991537b09b672853ab47c6c79a607228555ca3723192d0"
    };

    for (const [relPath, expectedHash] of Object.entries(frozenFiles)) {
      const actualHash = sha256File(path.join(ROOT_DIR, relPath));
      expect(actualHash).toBe(expectedHash);
    }
  });
});
