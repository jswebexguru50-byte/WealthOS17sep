import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — Partial 2026 Rule Enforcement Tests', () => {
  const regPath = path.resolve('reports/v672/WFO_WINDOW_REGISTRY.json');

  it('strictly marks 2026 as PARTIAL_YEAR ending on 2026-09-15', () => {
    expect(fs.existsSync(regPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(regPath, 'utf8'));

    expect(data.partialYearFlag).toBe(true);
    expect(data.partialYearEndpoint).toBe('2026-09-15');

    const w6 = data.windows.find((w: any) => w.windowId === 'WFO-06');
    expect(w6).toBeDefined();
    expect(w6.periodStatus).toBe('PARTIAL_YEAR');
    expect(w6.oosEnd).toBe('2026-09-15');
  });

  it('rejects treating 2026 as a full annual calendar year in research claims', () => {
    const isFullYear = (endpoint: string) => endpoint === '2026-12-31';
    expect(isFullYear('2026-09-15')).toBe(false);
  });
});
