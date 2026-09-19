import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('V672-R1 — WFO Window Exact Registry Tests', () => {
  const regPath = path.resolve('reports/v672/WFO_WINDOW_REGISTRY.json');

  it('exposes all 6 rolling WFO windows with train, validation, and OOS boundaries', () => {
    expect(fs.existsSync(regPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(regPath, 'utf8'));

    expect(data.totalWindows).toBe(6);
    expect(data.windows.length).toBe(6);

    for (const w of data.windows) {
      expect(w.windowId).toBeDefined();
      expect(w.trainStart).toBeDefined();
      expect(w.trainEnd).toBeDefined();
      expect(w.oosStart).toBeDefined();
      expect(w.oosEnd).toBeDefined();
      expect(w.purgeSessions).toBeGreaterThanOrEqual(5);
      expect(w.embargoSessions).toBeGreaterThanOrEqual(10);
      expect(w.dataSnapshotHash).toBeDefined();
      expect(w.configurationHash).toBeDefined();
      expect(w.tradeCount).toBeGreaterThan(400);
      expect(w.Sharpe).toBeGreaterThan(1.4);
      expect(w.configurationLockedAt).toBeDefined();
      expect(new Date(w.configurationLockedAt).getTime()).toBeLessThan(new Date(w.oosStart).getTime());
      expect(w.preOosLockDays).toBeGreaterThanOrEqual(14);
      expect(w.oosLocked).toBe(true);
      expect(w.designRationale).toBeDefined();
    }
  });

  it('validates WFO-06 multi-year holdout lineage and partial-year data cutoff specification', () => {
    const data = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const wfo06 = data.windows.find((w: any) => w.windowId === 'WFO-06');

    expect(wfo06).toBeDefined();
    expect(wfo06.periodStatus).toBe('PARTIAL_YEAR');
    expect(wfo06.oosStart).toBe('2024-03-01');
    expect(wfo06.oosEnd).toBe('2026-09-15');
    expect(wfo06.configurationLockedAt).toBe('2024-02-15T00:00:00Z');
    expect(wfo06.preOosLockDays).toBe(15);
    expect(wfo06.designRationale).toContain('multi-year post-calibration holdout');
    expect(wfo06.designRationale).toContain('2026-09-15');
  });
});
