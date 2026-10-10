import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { readTargetedFereStatus } from '../../src/server/services/FereEvidenceService.js';

const previous = process.env.FERE_TARGETED_STATUS_FILE;

afterEach(() => {
  if (previous === undefined) delete process.env.FERE_TARGETED_STATUS_FILE;
  else process.env.FERE_TARGETED_STATUS_FILE = previous;
});

describe('targeted FERE status snapshot', () => {
  test('returns null when no status path is configured', () => {
    delete process.env.FERE_TARGETED_STATUS_FILE;
    expect(readTargetedFereStatus()).toBeNull();
  });

  test('reads an object snapshot from the configured path', () => {
    const file = path.join(os.tmpdir(), `fere-status-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ status: 'RUNNING', completed: 2, total: 6 }));
    process.env.FERE_TARGETED_STATUS_FILE = file;
    expect(readTargetedFereStatus()).toEqual({ status: 'RUNNING', completed: 2, total: 6 });
    fs.rmSync(file, { force: true });
  });

  test('ignores malformed and array snapshots', () => {
    const file = path.join(os.tmpdir(), `fere-status-bad-${process.pid}-${Date.now()}.json`);
    process.env.FERE_TARGETED_STATUS_FILE = file;
    fs.writeFileSync(file, '{bad');
    expect(readTargetedFereStatus()).toBeNull();
    fs.writeFileSync(file, '[]');
    expect(readTargetedFereStatus()).toBeNull();
    fs.rmSync(file, { force: true });
  });
});
