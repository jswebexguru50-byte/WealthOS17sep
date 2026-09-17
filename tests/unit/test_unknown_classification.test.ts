import { describe, it, expect } from 'vitest';
import { BlindSpotEngine } from '../../src/server/intelligence/services/BlindSpotEngine.js';
import { UnknownState } from '../../src/server/intelligence/types/ThesisDefinition.js';

describe('Phase 1B: FR-09 Unknown Classification Invariants', () => {
  const engine = new BlindSpotEngine();

  it('generates baseline checklist with all items initialized to NOT_YET_CHECKED', () => {
    const checklist = engine.generateBaselineChecklist('SOLARINDS');

    expect(checklist.length).toBeGreaterThanOrEqual(5);
    checklist.forEach(item => {
      expect(item.state).toBe('NOT_YET_CHECKED');
      expect(item.decisionImpact).toBeDefined();
    });
  });

  it('transitions state to CONFIRMED_ABSENT and excludes it from active blind spots', () => {
    const checklist = engine.generateBaselineChecklist('SOLARINDS');
    const pledgeItem = checklist.find(i => i.domain === 'RELATED_PARTY')!;

    const updated = engine.updateUnknownState(
      pledgeItem,
      'CONFIRMED_ABSENT',
      'Audited Note 34 confirms zero related-party advances or inter-corporate deposits.'
    );

    expect(updated.state).toBe('CONFIRMED_ABSENT');
    expect(updated.searchSummary).toContain('Audited Note 34');

    const activeList = engine.getActiveBlindSpots([updated, checklist[1]]);
    expect(activeList).toHaveLength(1);
    expect(activeList[0].domain).toBe('OFF_BALANCE_SHEET');
  });

  it('keeps SEARCHED_AND_NOT_FOUND distinct from UNRESOLVED', () => {
    const checklist = engine.generateBaselineChecklist('63MOONS');

    const itemA = engine.updateUnknownState(
      checklist[0],
      'SEARCHED_AND_NOT_FOUND',
      'Searched FY24 annual report and concall transcripts; no mention of customer concentration.'
    );

    const itemB = engine.updateUnknownState(
      checklist[1],
      'UNRESOLVED',
      'Litigation note mentions ₹450 Cr claim disputed in High Court with ambiguous outcome.'
    );

    expect(itemA.state).toBe('SEARCHED_AND_NOT_FOUND');
    expect(itemB.state).toBe('UNRESOLVED');
    expect(itemA.state).not.toEqual(itemB.state);
  });
});
