import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.2 Universe Resolution Audit Unit Tests', () => {
  const eventsPath = path.join(process.cwd(), 'data/v6.4/v642_universe_resolution_events.jsonl');

  test('1. Audits universe resolution requests and records historical vs fallbackBlocked events', () => {
    expect(fs.existsSync(eventsPath)).toBe(true);
    const events = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));

    expect(events.length).toBeGreaterThanOrEqual(2);
    const valid = events.find(e => e.provider === 'OfficialHistoricalPITProvider');
    expect(valid).toBeDefined();
    expect(valid.fallbackUsed).toBe(false);
  });
});
