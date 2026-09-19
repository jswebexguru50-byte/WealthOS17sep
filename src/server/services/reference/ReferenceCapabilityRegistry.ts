/**
 * WealthOS v6.6–v6.7 - Reference Capability Registry
 * External Reference Acceleration Layer
 * 
 * Maps external technical capabilities (PKScreener) to WealthOS strategies (S1–S20).
 * All capabilities default to candidateOnly = true to prevent unauthorized promotion.
 */

export interface ReferenceCapability {
  capabilityId: string;
  category:
    | 'TREND'
    | 'MOMENTUM'
    | 'VOLUME'
    | 'VOLATILITY'
    | 'PATTERN'
    | 'BREAKOUT'
    | 'INTRADAY'
    | 'UNIVERSE'
    | 'RISK';
  referenceProvider: string;
  wealthOSMappings: string[];
  requiresIntraday: boolean;
  requiresDaily: boolean;
  candidateOnly: boolean;
}

export const PKSCREENER_CAPABILITIES: ReferenceCapability[] = [
  {
    capabilityId: 'VCP',
    category: 'PATTERN',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S5'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: '52W_HIGH_BREAKOUT',
    category: 'BREAKOUT',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S6'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'VOLUME_BREAKOUT',
    category: 'VOLUME',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S9', 'S19'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'HIGHER_HIGH_LOWER_LOW',
    category: 'TREND',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S3'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'RSI_REVERSAL',
    category: 'MOMENTUM',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S7'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'VSA',
    category: 'VOLUME',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S1', 'S19'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'NR4',
    category: 'VOLATILITY',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: [],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'NR7',
    category: 'VOLATILITY',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: [],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'INSIDE_BAR',
    category: 'PATTERN',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: [],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'CUP_HANDLE',
    category: 'PATTERN',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S8'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'ATR_CROSS',
    category: 'VOLATILITY',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S10'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'INTRADAY_BREAKOUT',
    category: 'INTRADAY',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S10'],
    requiresIntraday: true,
    requiresDaily: false,
    candidateOnly: true
  },
  {
    capabilityId: 'TRENDLINE_SUPPORT',
    category: 'TREND',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: ['S10'],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  },
  {
    capabilityId: 'TTM_SQUEEZE',
    category: 'VOLATILITY',
    referenceProvider: 'PKSCREENER',
    wealthOSMappings: [],
    requiresIntraday: false,
    requiresDaily: true,
    candidateOnly: true
  }
];

export class ReferenceCapabilityRegistry {
  private static instance: ReferenceCapabilityRegistry;
  private capabilities = new Map<string, ReferenceCapability>();

  private constructor() {
    for (const cap of PKSCREENER_CAPABILITIES) {
      this.capabilities.set(cap.capabilityId, cap);
    }
  }

  public static getInstance(): ReferenceCapabilityRegistry {
    if (!ReferenceCapabilityRegistry.instance) {
      ReferenceCapabilityRegistry.instance = new ReferenceCapabilityRegistry();
    }
    return ReferenceCapabilityRegistry.instance;
  }

  public getCapability(id: string): ReferenceCapability | undefined {
    return this.capabilities.get(id);
  }

  public getAll(): ReferenceCapability[] {
    return Array.from(this.capabilities.values());
  }

  public getByWealthOSStrategy(strategyId: string): ReferenceCapability[] {
    return Array.from(this.capabilities.values()).filter(c => c.wealthOSMappings.includes(strategyId));
  }
}
