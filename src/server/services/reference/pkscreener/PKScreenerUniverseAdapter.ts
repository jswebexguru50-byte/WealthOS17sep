/**
 * WealthOS v6.6–v6.7 - PKScreener Universe Adapter
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * - Maps PKScreener target tickers to canonical WealthOS securityIds.
 * - Prevents survivorship bias and unmapped symbol drift.
 * - Prohibits external live data downloads from polluting historical universe.
 */

import { SecurityIdentityRegistry } from '../../data/SecurityIdentityRegistry.js';

export class PKScreenerUniverseAdapter {
  private identityRegistry = SecurityIdentityRegistry.getInstance();

  public resolveUniverse(rawSymbols: string[]): Array<{ symbol: string; securityId: string; valid: boolean }> {
    return rawSymbols.map(sym => {
      const clean = sym.toUpperCase().trim();
      const identity = this.identityRegistry.resolveBySymbol(clean);
      return {
        symbol: clean,
        securityId: identity ? identity.securityId : `UNRESOLVED_${clean}`,
        valid: identity !== undefined
      };
    });
  }
}
