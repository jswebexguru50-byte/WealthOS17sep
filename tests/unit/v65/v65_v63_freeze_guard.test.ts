import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";

describe("v6.5 Freeze Guard Tests", () => {
  const FROZEN_FILES: Record<string, string> = {
    "src/server/services/PureTechnicalStrategiesEngine.ts": "a65639c8a5c00f1f5a911e8b0a6ddc7046e8c05cbc2a72ded47a3817a59b119a",
    "src/server/services/NewTechnicalStrategiesEngine.ts": "74cf1b2410bb3b24b60ea4c713086ffd588df79f4f831d8b27015b4bb423eab1",
    "src/server/services/SignalQualityOverlay.ts": "12e95b48729dc18252838a8e44cdf70aeac3891a4a1a20116fa290dd101a9dfa",
    "src/server/services/CapitalProtectionEngine.ts": "126a8c197eca22a702d689823dcccbb207ee87ec20e386078e104a77488385e2",
    "src/server/services/StrategyParameterConfig.ts": "d04a8a653e2950516d7feb5838f024af89e8fc8747fb0052ffd26dd1e5083b02",
    "src/server/services/UpstoxIntradayIngestor.ts": "632d0ca4e20c0bb7e2991537b09b672853ab47c6c79a607228555ca3723192d0",
    "data/v6.3_REAL_trade_identity_ledger.jsonl": "035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485"
  };

  it("should verify all 7 frozen files match exact SHA-256 hashes", () => {
    for (const [relPath, expectedSha] of Object.entries(FROZEN_FILES)) {
      const fullPath = path.join(process.cwd(), relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const buf = fs.readFileSync(fullPath);
      const actualSha = crypto.createHash("sha256").update(buf).digest("hex");
      expect(actualSha).toBe(expectedSha);
    }
  });

  it("should verify productionPromotionAuthorized remains strictly false in lockbox", () => {
    const lockboxPath = path.join(process.cwd(), "data", "v6.5", "v65_replay_lockbox.json");
    expect(fs.existsSync(lockboxPath)).toBe(true);
    const lockbox = JSON.parse(fs.readFileSync(lockboxPath, "utf-8"));
    expect(lockbox.productionPromotionAuthorized).toBe(false);
  });
});
