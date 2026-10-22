import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockScansWorkspace } from '../../src/components/stockscans/StockScansWorkspace.js';

describe('StockScans Workspace Render Tests (React DOM)', () => {
  it('renders workspace successfully with all tabs and without hardcoded 2,927 denominator', () => {
    const html = renderToStaticMarkup(
      React.createElement(StockScansWorkspace, {
        onSelectStock: () => {},
        selectedPortfolio: 'Test Portfolio'
      })
    );

    // Verify main workspace branding and workflows
    expect(html).toContain('Market Breadth');
    expect(html).toContain('Scans &amp; Discovery');
    expect(html).toContain('Scan Match');
    expect(html).toContain('Evidence &amp; Filings');
    expect(html).toContain('Shareholding &amp; Guidance');
    expect(html).toContain('Returns Benchmark');
    expect(html).toContain('Custom Indices');
    expect(html).toContain('Peer Matrix');
    expect(html).toContain('Valuation Calculators');
    expect(html).toContain('Durable Alerts');
    expect(html).toContain('Source Audit');

    // Non-negotiable integrity verification:
    // Ensure the hardcoded "2,927 covered" text is NOT present in the static markup
    expect(html).not.toContain('/ 2,927 covered');
    expect(html).not.toContain('/ 2927 covered');

    // Data Provenance tags
    expect(html).toContain('DuckDB Adjusted OHLCV');
  });
});
