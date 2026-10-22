import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanyIntelligenceOverview } from '../../src/components/company-intelligence/CompanyIntelligenceOverview.js';

describe('CompanyIntelligenceOverview', () => {
  it('renders sourced intelligence and does not use transport-level availability as evidence', () => {
    const html = renderToStaticMarkup(React.createElement(CompanyIntelligenceOverview, {
      modules: {
        businessDrivers: {
          status: 'WORKING', dataStatus: 'PARTIAL', evidenceRefs: [{ evidenceId: 'driver-1' }],
          result: { primaryDrivers: [{ driverId: 'revenue', name: 'Revenue growth', direction: 'IMPROVING', currentState: 'FY25 revenue increased', evidence: [{ evidenceId: 'fact-1' }] }] },
        },
        delta: {
          status: 'WORKING', dataStatus: 'PARTIAL', evidenceRefs: [{ evidenceId: 'delta-1' }],
          result: { deltas: [{ deltaId: 'margin', item: 'EBITDA margin', direction: 'IMPROVED', materiality: 'HIGH', explanation: 'Margin expanded', evidence: [{ evidenceId: 'fact-2' }] }] },
        },
        contradictions: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { contradictions: [] }, missingRequirements: ['Quarterly CFO history unavailable'] },
        management: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { commitments: [] } },
        valuation: {
          status: 'PARTIAL', dataStatus: 'PARTIAL', evidenceRefs: [{ evidenceId: 'valuation-1' }],
          result: { pe: { metric: 'P/E', current: 24.1, evidence: [{ evidenceId: 'fact-3' }] }, pb: { metric: 'P/B', current: null, evidence: [] } },
        },
        thesis: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { pillars: [] } },
        attention: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { items: [], questions: [] } },
      },
    }));

    expect(html).toContain('Revenue growth');
    expect(html).toContain('FY25 revenue increased');
    expect(html).toContain('EBITDA margin');
    expect(html).toContain('24.1x');
    expect(html).toContain('Quarterly CFO history unavailable');
    expect(html).toContain('No sourced contradiction evidence is available');
    expect(html).not.toContain('decisionStatus');
    expect(html).not.toContain('dataState');
  });

  it('does not turn an empty sourced module into a clean or positive conclusion', () => {
    const html = renderToStaticMarkup(React.createElement(CompanyIntelligenceOverview, {
      modules: {
        businessDrivers: { status: 'SOURCE_UNAVAILABLE', dataStatus: 'SOURCE_UNAVAILABLE', result: { drivers: [] }, missingRequirements: ['Provider did not return operating drivers'] },
        delta: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { deltas: [] } },
        contradictions: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { contradictions: [] } },
        management: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { commitments: [] } },
        valuation: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: {} },
        thesis: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { pillars: [] } },
        attention: { status: 'DATA_INSUFFICIENT', dataStatus: 'DATA_INSUFFICIENT', result: { items: [], questions: [] } },
      },
    }));

    expect(html).toContain('No sourced business-driver evidence is available');
    expect(html).toContain('SOURCE UNAVAILABLE');
    expect(html).toContain('Provider did not return operating drivers');
    expect(html).not.toContain('No material risks');
    expect(html).not.toContain('clean');
  });
});
