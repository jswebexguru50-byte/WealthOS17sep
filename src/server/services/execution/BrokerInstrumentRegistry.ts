/**
 * WealthOS v6.6–v6.7 - Broker Instrument Registry
 * Execution Architecture
 * 
 * SPEC MANDATE:
 * Maintains broker-specific instrument tokens while keeping WealthOS securityId authoritative:
 *   SecurityIdentityRegistry -> BrokerInstrumentRegistry -> Broker Token
 */

import { BrokerInstrument } from '../reference/fenix/FenixInstrumentAdapter.js';

export class BrokerInstrumentRegistry {
  private static instance: BrokerInstrumentRegistry;
  private instruments = new Map<string, BrokerInstrument>();

  public static getInstance(): BrokerInstrumentRegistry {
    if (!BrokerInstrumentRegistry.instance) {
      BrokerInstrumentRegistry.instance = new BrokerInstrumentRegistry();
    }
    return BrokerInstrumentRegistry.instance;
  }

  public register(inst: BrokerInstrument): void {
    const key = `${inst.provider.toUpperCase()}:${inst.securityId}`;
    this.instruments.set(key, inst);
  }

  public resolve(provider: string, securityId: string): BrokerInstrument | undefined {
    return this.instruments.get(`${provider.toUpperCase()}:${securityId}`);
  }
}
