/**
 * WealthOS v6.6–v6.7 - PKScreener Version Registry
 * External Reference Acceleration Layer
 */

import { ReferenceVersionRegistry, ReferenceVersion } from '../ReferenceVersionRegistry.js';

export class PKScreenerVersionRegistry {
  public static getPinnedPKScreenerVersion(): ReferenceVersion {
    return ReferenceVersionRegistry.getInstance().assertVersionPinned('PKSCREENER');
  }
}
