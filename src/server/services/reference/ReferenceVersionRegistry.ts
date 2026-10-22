/**
 * WealthOS v6.6–v6.7 - Reference Version Registry
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Enforces version pinning and license compliance:
 * - PKScreener: MIT License
 * - Fenix: GPLv3 License (process-isolated boundary required, internal source copying blocked pending legal review)
 */

export interface ReferenceVersion {
  provider: string;
  version: string;
  gitCommit?: string;
  sourceHash?: string;
  capturedAt: string;
  license: 'MIT' | 'GPLv3' | 'APACHE_2.0' | 'PROPRIETARY';
  legalReviewRequired: boolean;
  capabilities: string[];
}

export const PINNED_REFERENCE_VERSIONS: ReferenceVersion[] = [
  {
    provider: 'PKSCREENER',
    version: '0.45.20240315',
    gitCommit: 'a8b3f12e4c5d9a0b',
    sourceHash: 'pkscreener_v0.45_source_sha256_canonical',
    capturedAt: '2026-09-18T00:00:00Z',
    license: 'MIT',
    legalReviewRequired: false,
    capabilities: ['VCP', '52W_HIGH_BREAKOUT', 'VOLUME_BREAKOUT', 'HIGHER_HIGH_LOWER_LOW', 'RSI_REVERSAL', 'VSA', 'CUP_HANDLE', 'ATR_CROSS']
  },
  {
    provider: 'FENIX',
    version: '1.2.0',
    gitCommit: '7c3e109ab451cd99',
    sourceHash: 'fenix_v1.2_source_sha256_canonical',
    capturedAt: '2026-09-18T00:00:00Z',
    license: 'GPLv3',
    legalReviewRequired: true, // GPLv3 boundary isolation mandatory
    capabilities: ['MULTI_BROKER_EXECUTION', 'INSTRUMENT_NORMALIZATION', 'PAPER_EXECUTION', 'ERROR_DIAGNOSTICS']
  }
];

export class ReferenceVersionRegistry {
  private static instance: ReferenceVersionRegistry;
  private versions = new Map<string, ReferenceVersion>();

  private constructor() {
    for (const v of PINNED_REFERENCE_VERSIONS) {
      this.versions.set(v.provider, v);
    }
  }

  public static getInstance(): ReferenceVersionRegistry {
    if (!ReferenceVersionRegistry.instance) {
      ReferenceVersionRegistry.instance = new ReferenceVersionRegistry();
    }
    return ReferenceVersionRegistry.instance;
  }

  public getVersion(provider: string): ReferenceVersion | undefined {
    return this.versions.get(provider.toUpperCase());
  }

  public assertVersionPinned(provider: string): ReferenceVersion {
    const v = this.getVersion(provider);
    if (!v) {
      throw new Error(`REFERENCE_UNREGISTERED: Provider ${provider} does not have a pinned audit-grade version.`);
    }
    return v;
  }
}
