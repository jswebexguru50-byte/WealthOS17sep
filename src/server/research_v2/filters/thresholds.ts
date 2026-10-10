import { DEFAULT_THRESHOLDS } from '../domain/index.js';
import type { ThresholdConfig, Thresholds } from '../domain/index.js';

export { DEFAULT_THRESHOLDS };

const COMPARATORS = new Set(['>', '>=', '<=', '==', 'info']);

/** Throw a clear error when an override is not a well-formed ThresholdConfig. */
function assertConfig(key: string, cfg: unknown): asserts cfg is ThresholdConfig {
  const c = cfg as Partial<ThresholdConfig> | null;
  const valueOk = c !== null && typeof c === 'object'
    && (c.value === null || (typeof c.value === 'number' && Number.isFinite(c.value)));
  const tolOk = c !== null && typeof c === 'object'
    && (c.tolerance === undefined || (typeof c.tolerance === 'number' && Number.isFinite(c.tolerance)));
  const cmpOk = c !== null && typeof c === 'object' && COMPARATORS.has(c.comparator as string);
  if (!valueOk || !tolOk || !cmpOk) {
    throw new Error(`Invalid threshold override for "${key}": expected { value: number|null, comparator, tolerance? }`);
  }
}

/**
 * Merge per-run overrides over the defaults. Each overridden filter replaces its whole config,
 * so a caller cannot accidentally keep a stale tolerance. A key explicitly set to undefined keeps
 * the default; unknown keys and malformed configs are rejected rather than silently ignored.
 */
export function resolveThresholds(overrides?: Partial<Thresholds>): Thresholds {
  const merged: Thresholds = { ...DEFAULT_THRESHOLDS };
  for (const [key, cfg] of Object.entries(overrides ?? {})) {
    if (cfg === undefined) continue;
    if (!(key in DEFAULT_THRESHOLDS)) throw new Error(`Unknown threshold key "${key}"`);
    assertConfig(key, cfg);
    (merged as unknown as Record<string, ThresholdConfig>)[key] = cfg;
  }
  return merged;
}
