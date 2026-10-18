import { describe, it, expect } from 'vitest';
import { TrendlyneMcpClient, TrendlyneNotConfiguredError } from '../../src/server/services/enrichment/trendlyne/TrendlyneMcpClient.js';
import { TrendlyneOwnershipAdapter } from '../../src/server/services/enrichment/trendlyne/TrendlyneOwnershipAdapter.js';
import { TrendlyneEventAdapter } from '../../src/server/services/enrichment/trendlyne/TrendlyneEventAdapter.js';
import { TrendlyneDocumentAdapter } from '../../src/server/services/enrichment/trendlyne/TrendlyneDocumentAdapter.js';

describe('Trendlyne fail-closed (no synthetic data)', () => {
  it('client throws TrendlyneNotConfiguredError instead of fabricating values', async () => {
    await expect(TrendlyneMcpClient.getInstance().getStockParameterValues(['TCS'], ['pettm']))
      .rejects.toBeInstanceOf(TrendlyneNotConfiguredError);
  });
  it('adapters persist nothing and report source_unavailable', async () => {
    expect(await TrendlyneOwnershipAdapter.getInstance().fetchOwnershipData('TCS'))
      .toEqual({ factsCreated: 0, status: 'source_unavailable' });
    expect(await TrendlyneEventAdapter.getInstance().fetchCorporateEvents('TCS'))
      .toEqual({ eventsCreated: 0, status: 'source_unavailable' });
    const d = await TrendlyneDocumentAdapter.getInstance().searchAndIngestDocumentEvidence('TCS', 'DOC_ANNUAL_REPORT', 'capex guidance');
    expect(d.documentsIngested).toBe(0);
    expect(d.status).toBe('source_unavailable');
  });
});
