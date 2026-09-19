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
      "src/server/services/PureTechnicalStrategiesEngine.ts": "825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3",
      "src/server/services/NewTechnicalStrategiesEngine.ts": "78415ba3c74ca6a9cc2fcc96d2e54ba871e9bca73fc6e078570c412781b1d354",
      "src/server/services/SignalQualityOverlay.ts": "c41cddb152c150bea932a8b9bd8fcc6ea01a03a2ba030a723789aaada5c17452",
      "src/server/services/CapitalProtectionEngine.ts": "63b8317889f5a60e9462f883e89acb57fe99e819935ec8f7b30036ecfe4ed753",
      "src/server/services/StrategyParameterConfig.ts": "901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b",
      "src/server/services/UpstoxIntradayIngestor.ts": "0f1c96d0e0c704672517f378990e17facdced7bfbf359daf9c6f37333be1b151"
    };

    for (const [relPath, expectedHash] of Object.entries(frozenFiles)) {
      const actualHash = sha256File(path.join(ROOT_DIR, relPath));
      expect(actualHash).toBe(expectedHash);
    }
  });
});
