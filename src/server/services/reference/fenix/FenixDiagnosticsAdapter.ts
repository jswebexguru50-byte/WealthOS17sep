/**
 * WealthOS v6.6–v6.7 - Fenix Diagnostics Adapter
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Implements structured broker diagnostics, categorized errors, and controlled retry policies.
 * Invariant: Never retry blindly on order submissions.
 */

export type ProviderErrorCategory =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'VALIDATION'
  | 'INSTRUMENT'
  | 'ORDER'
  | 'MARKET'
  | 'UNKNOWN';

export interface ProviderError {
  provider: string;
  operation: string;
  code: string;
  category: ProviderErrorCategory;
  retryable: boolean;
  timestamp: string;
  requestHash?: string;
  responseHash?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  retryableCategories: ProviderErrorCategory[];
}

export const DEFAULT_EXECUTION_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 250,
  maxDelayMs: 1000,
  exponentialBackoff: true,
  retryableCategories: ['NETWORK', 'RATE_LIMIT'] // Never retry ORDER or VALIDATION
};

export class FenixDiagnosticsAdapter {
  public parseError(provider: string, operation: string, rawError: any): ProviderError {
    const msg = rawError?.message || String(rawError);
    let category: ProviderErrorCategory = 'UNKNOWN';
    let retryable = false;

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      category = 'RATE_LIMIT';
      retryable = true;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
      category = 'NETWORK';
      retryable = true;
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      category = 'AUTH';
      retryable = false;
    } else if (msg.toLowerCase().includes('insufficient funds') || msg.toLowerCase().includes('rejected')) {
      category = 'ORDER';
      retryable = false;
    }

    return {
      provider,
      operation,
      code: rawError?.code || 'ERR_GENERIC',
      category,
      retryable,
      timestamp: new Date().toISOString()
    };
  }
}
