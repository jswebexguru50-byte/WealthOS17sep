/**
 * TrendlyneEventAdapter.ts — Corporate Actions & News Events Adapter
 * WealthOS V2 Mandatory Amendment
 */

import { TrendlyneMcpClient, TrendlyneNotConfiguredError } from './TrendlyneMcpClient.js';
import { CompanyEventRepository } from '../../intelligence/core/CompanyEventRepository.js';

export class TrendlyneEventAdapter {
  private static instance: TrendlyneEventAdapter;
  private readonly client: TrendlyneMcpClient;
  private readonly eventRepo: CompanyEventRepository;

  private constructor(
    client = TrendlyneMcpClient.getInstance(),
    eventRepo = CompanyEventRepository.getInstance()
  ) {
    this.client = client;
    this.eventRepo = eventRepo;
  }

  public static getInstance(): TrendlyneEventAdapter {
    if (!TrendlyneEventAdapter.instance) {
      TrendlyneEventAdapter.instance = new TrendlyneEventAdapter();
    }
    return TrendlyneEventAdapter.instance;
  }

  public async fetchCorporateEvents(symbol: string): Promise<{ eventsCreated: number; status: 'ok' | 'source_unavailable' }> {
    try {
      this.client.assertTransport('get_overview_news_corp_events');
    } catch (err) {
      if (err instanceof TrendlyneNotConfiguredError) {
        console.warn(`[TrendlyneEvents] source_unavailable for ${symbol}: ${err.message}`);
        return { eventsCreated: 0, status: 'source_unavailable' };
      }
      throw err;
    }
    return { eventsCreated: 0, status: 'source_unavailable' };
  }
}
