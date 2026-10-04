import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockIntelligenceView } from '../../src/components/StockIntelligenceView.js';
import fs from 'node:fs';
import path from 'node:path';

describe('StockIntelligenceView Architecture & Invariant Tests', () => {
  it('returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(StockIntelligenceView, {
        symbol: 'INFY',
        isOpen: false,
        onClose: () => {}
      })
    );
    expect(html).toBe('');
  });

  it('renders Analyze360View directly when isOpen is true with complete candidate context', () => {
    const html = renderToStaticMarkup(
      React.createElement(StockIntelligenceView, {
        symbol: 'INFY',
        isOpen: true,
        onClose: () => {},
        candidateId: 'cand-infy-1',
        signalIds: ['sig-1', 'sig-2'],
        recommendedDate: '2026-09-30',
        strategyIds: ['S1A']
      })
    );

    // Analyze360View initial render structure
    expect(html).toContain('INFY');
    expect(html).toContain('Analyze 360');
  });

  it('preserves legacy modal when mode is explicitly set to legacy', () => {
    const html = renderToStaticMarkup(
      React.createElement(StockIntelligenceView, {
        symbol: 'INFY',
        isOpen: true,
        onClose: () => {},
        mode: 'legacy'
      })
    );

    expect(html).toContain('INFY');
    expect(html).toContain('Company Intelligence');
  });

  it('verifies DuckDB warmup is actively wired in server.ts after app.listen()', () => {
    const serverTsPath = path.resolve('server.ts');
    const content = fs.readFileSync(serverTsPath, 'utf8');

    expect(content).toContain("import { DuckDbAdjustedOhlcvService } from './src/server/services/DuckDbAdjustedOhlcvService.js'");
    expect(content).toContain("process.env.ENABLE_DUCKDB_WARMUP !== 'false'");
    expect(content).toContain('DuckDbAdjustedOhlcvService.warmup().catch');
  });
});
