import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Dossier canonical acquisition contract', () => {
  it('resolves canonical fundamentals before compatibility fallback', () => {
    const source = fs.readFileSync('src/server/services/ScripIntelligenceDossierService.ts', 'utf8');
    expect(source).toContain('BatchFundamentalProvider.getInstance().get(sym)');
    expect(source).toContain('canonicalSnapshotAsDossierData(snapshot)');
    expect(source).toContain('ScreenerService.getInstance().fetchScreenerData(sym)');
  });
});
