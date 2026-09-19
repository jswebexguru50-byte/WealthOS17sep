import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('v6.4.2 v6.3 Freeze Guard Unit Tests', () => {
  const FROZEN_FILES: Record<string, string> = {
    "src/server/services/PureTechnicalStrategiesEngine.ts": "825fa6c067cf26ab28e15451abea80e1015ea15a8f24145102f7fc054977a2a3",
    "src/server/services/NewTechnicalStrategiesEngine.ts": "78415ba3c74ca6a9cc2fcc96d2e54ba871e9bca73fc6e078570c412781b1d354",
    "src/server/services/SignalQualityOverlay.ts": "c41cddb152c150bea932a8b9bd8fcc6ea01a03a2ba030a723789aaada5c17452",
    "src/server/services/CapitalProtectionEngine.ts": "63b8317889f5a60e9462f883e89acb57fe99e819935ec8f7b30036ecfe4ed753",
    "src/server/services/StrategyParameterConfig.ts": "901ca7a27b2eb4e09183426c9e0dfd7b812aeebf84472b49b9f829661fe7194b",
    "src/server/services/UpstoxIntradayIngestor.ts": "0f1c96d0e0c704672517f378990e17facdced7bfbf359daf9c6f37333be1b151",
    "data/v6.3_REAL_trade_identity_ledger.jsonl": "035d8867f1f8dbc65f9fe35ea45263f20f9fee00a48d3d7f48807c24a2afd485"
  };

  test('1. All 6 production strategy/execution files and canonical ledger remain 100% hash stable', () => {
    for (const [relPath, expectedSha] of Object.entries(FROZEN_FILES)) {
      const absPath = path.join(process.cwd(), relPath);
      expect(fs.existsSync(absPath)).toBe(true);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
      expect(actualSha).toBe(expectedSha);
    }
  });
});
