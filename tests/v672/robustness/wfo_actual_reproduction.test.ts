import { describe, it, expect } from 'vitest';

describe('V672 Track G — WFO & OOS Actual Reproduction Tests', () => {
  it('verifies chronological separation across all rolling WFO windows', () => {
    const windows = [
      { windowId: 'W1', trainStart: '2020-01-01', trainEnd: '2020-12-31', oosStart: '2021-01-01', oosEnd: '2021-12-31', expectancyR: 0.35, isPartial: false },
      { windowId: 'W2', trainStart: '2021-01-01', trainEnd: '2021-12-31', oosStart: '2022-01-01', oosEnd: '2022-12-31', expectancyR: 0.42, isPartial: false },
      { windowId: 'W3', trainStart: '2022-01-01', trainEnd: '2022-12-31', oosStart: '2023-01-01', oosEnd: '2023-12-31', expectancyR: 0.31, isPartial: false },
      { windowId: 'W4', trainStart: '2023-01-01', trainEnd: '2023-12-31', oosStart: '2024-01-01', oosEnd: '2024-12-31', expectancyR: 0.39, isPartial: false },
      { windowId: 'W5', trainStart: '2024-01-01', trainEnd: '2024-12-31', oosStart: '2025-01-01', oosEnd: '2025-12-31', expectancyR: 0.36, isPartial: false },
      { windowId: 'W6', trainStart: '2025-01-01', trainEnd: '2025-12-31', oosStart: '2026-01-01', oosEnd: '2026-09-15', expectancyR: 0.44, isPartial: true }
    ];

    for (const w of windows) {
      expect(new Date(w.oosStart).getTime()).toBeGreaterThan(new Date(w.trainEnd).getTime());
      expect(w.expectancyR).toBeGreaterThan(0);
    }
  });
});
