import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('canonical consumer boundary', () => {
  it('prevents analytical engines from querying raw acquisition snapshots', () => {
    const consumers = [
      'src/server/services/intelligence/modules/FundamentalExperienceBuilder.ts',
      'src/server/services/intelligence/modules/RecentAccumulationEngine.ts',
      'src/server/services/intelligence/modules/ValuationModuleAdapter.ts',
      'src/server/services/OpportunityScannerEngine.ts',
    ];
    for (const file of consumers) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).not.toContain('fundamental_endpoint_snapshots');
      expect(source, file).not.toContain('response_json');
    }
  });
});
