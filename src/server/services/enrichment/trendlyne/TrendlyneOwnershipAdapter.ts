/**
 * TrendlyneOwnershipAdapter.ts — Shareholding, SAST, Insider Deals & Pledge Adapter
 * WealthOS V2 Mandatory Amendment
 */

import { TrendlyneMcpClient, TrendlyneNotConfiguredError } from './TrendlyneMcpClient.js';
import { CanonicalFactRepository } from '../../intelligence/core/CanonicalFactRepository.js';

export class TrendlyneOwnershipAdapter {
  private static instance: TrendlyneOwnershipAdapter;
  private readonly client: TrendlyneMcpClient;
  private readonly factRepo: CanonicalFactRepository;

  private constructor(
    client = TrendlyneMcpClient.getInstance(),
    factRepo = CanonicalFactRepository.getInstance()
  ) {
    this.client = client;
    this.factRepo = factRepo;
  }

  public static getInstance(): TrendlyneOwnershipAdapter {
    if (!TrendlyneOwnershipAdapter.instance) {
      TrendlyneOwnershipAdapter.instance = new TrendlyneOwnershipAdapter();
    }
    return TrendlyneOwnershipAdapter.instance;
  }

  /**
   * Persists nothing unless a real transport returns data. Today the client has none:
   * TrendlyneNotConfiguredError is caught and reported as source_unavailable.
   */
  public async fetchOwnershipData(symbol: string): Promise<{ factsCreated: number; status: 'ok' | 'source_unavailable' }> {
    try {
      this.client.assertTransport('get_ownership_deals_insider_sast');
    } catch (err) {
      if (err instanceof TrendlyneNotConfiguredError) {
        console.warn(`[TrendlyneOwnership] source_unavailable for ${symbol}: ${err.message}`);
        return { factsCreated: 0, status: 'source_unavailable' };
      }
      throw err;
    }
    return { factsCreated: 0, status: 'source_unavailable' };
  }
}
