/**
 * WealthOS v6.6–v6.7 - Fenix Instrument Adapter
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Normalizes broker instrument tokens while preserving canonical securityIds:
 *   SecurityIdentityRegistry -> BrokerInstrumentRegistry -> Fenix Instrument Token
 */

export interface BrokerInstrument {
  securityId: string;
  provider: string;
  providerInstrumentId: string;
  exchange: string;
  symbol: string;
  expiry?: string;
  strike?: number;
  optionType?: 'CE' | 'PE';
  validFrom: string;
  validTo?: string;
}

export class FenixInstrumentAdapter {
  private tokenMap = new Map<string, BrokerInstrument>();

  public registerInstrument(instrument: BrokerInstrument): void {
    const key = `${instrument.provider}:${instrument.securityId}`;
    this.tokenMap.set(key, instrument);
  }

  public resolveToken(provider: string, securityId: string): BrokerInstrument | undefined {
    return this.tokenMap.get(`${provider}:${securityId}`);
  }
}
