import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const infra = fs.readFileSync('src/server/routes/infra.ts', 'utf8');

describe('route-family canonical acquisition regression', () => {
  it('Analyze360 refresh promotes the acquired public artifact before reporting success', () => {
    const handler = infra.slice(infra.indexOf('const handleAnalyze360RefreshData'), infra.indexOf("router.get('/analyze360/:symbol"));
    expect(handler).toContain('acquire_exchange_data.mjs');
    expect(handler).toContain('ingestExchangeArtifactForSymbol(normalized)');
    expect(handler).toContain("status: 'PROMOTED'");
    expect(handler).toContain('mcpUsed: false');
  });

  it('refresh route has a 24-hour acquisition cache and never treats a download alone as canonical', () => {
    const handler = infra.slice(infra.indexOf('const handleAnalyze360RefreshData'), infra.indexOf("router.get('/analyze360/:symbol"));
    expect(handler).toContain('cacheFresh');
    expect(handler).toContain('24 * 60 * 60 * 1000');
    expect(handler).toContain('factsInserted > 0');
    expect(handler).toContain('NO_PROMOTABLE_PUBLIC_FACTS');
  });
});
