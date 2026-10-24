/**
 * src/server/services/BrokerAPI.ts
 * Mock broker APIs for testing and development
 */

import { TimestampService } from './TimestampService.js';

export interface BrokerHolding {
  symbol: string;
  quantity: number;
  price: number;
}

export interface BrokerEvidence {
  urls: string[];
  timestamp: string;
  reliability: number;
}

export class BrokerAPI {
  private static instance: BrokerAPI;
  private tsService = TimestampService.getInstance();

  static getInstance(): BrokerAPI {
    if (!BrokerAPI.instance) {
      BrokerAPI.instance = new BrokerAPI();
    }
    return BrokerAPI.instance;
  }

  async fetchZerodhaHoldings(portfolioId: string): Promise<BrokerHolding[]> {
    // Mock implementation
    return [];
  }

  async fetchZerodhaEvidence(portfolioId: string): Promise<BrokerEvidence> {
    return {
      urls: ['https://api.zerodha.com/holdings'],
      timestamp: this.tsService.getCurrentTimestamp(),
      reliability: 0.98
    };
  }

  async fetchPmsHoldings(portfolioId: string): Promise<BrokerHolding[]> {
    // Mock implementation
    return [];
  }

  async fetchPmsEvidence(portfolioId: string): Promise<BrokerEvidence> {
    return {
      urls: ['https://api.pms.example.com/holdings'],
      timestamp: this.tsService.getCurrentTimestamp(),
      reliability: 0.95
    };
  }

  isAvailable(brokerType: string): boolean {
    return ['zerodha', 'pms'].includes(brokerType.toLowerCase());
  }
}
