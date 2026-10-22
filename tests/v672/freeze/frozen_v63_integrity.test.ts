import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('V672-R1 — Frozen v6.3 Controls Integrity Tests', () => {
  const manifestPath = path.resolve('config/v67/FROZEN_V63_CONTROL_MANIFEST.json');

  it('asserts all 7 canonical v6.3 strategy and parameter assets match SHA-256 bit-for-bit', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(manifest.artifacts.length).toBe(7);

    for (const asset of manifest.artifacts) {
      const fullPath = path.resolve(asset.path);
      expect(fs.existsSync(fullPath), `Missing frozen asset: ${asset.path}`).toBe(true);

      const content = fs.readFileSync(fullPath);
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');

      expect(actualHash, `SHA-256 hash mutation detected in frozen asset: ${asset.path}`).toBe(asset.sha256);
    }
  });
});
