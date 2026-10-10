import { createHash } from 'node:crypto';

/** Scheme used for items that have no web URL (for example a Trendlyne document chunk). */
export const INTERNAL_DOC_SCHEME = 'trendlyne-doc:';

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source', 'cmpid', 'spm', 'si', 'feature',
]);

/** Hosts (matched as suffix) that publish primary records: exchanges, regulators, registries. */
export const PRIMARY_HOST_SUFFIXES = [
  'nseindia.com', 'bseindia.com', 'sebi.gov.in', 'rbi.org.in', 'mca.gov.in', 'gov.in', 'nic.in',
];

/** Secondary hosts: media, aggregators, video and social sites. Their items are leads only. */
export const SECONDARY_HOST_SUFFIXES = [
  'moneycontrol.com', 'stockscans.in', 'multibagg.ai', 'valueresearchonline.com', 'valueresearch.com',
  'ft.com', 'cnbctv18.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'facebook.com', 'reddit.com',
  'linkedin.com', 't.me', 'stocktwits.com', 'instagram.com', 'trendlyne.com', 'screener.in', 'tickertape.in',
];

export type HostClass = 'PRIMARY' | 'SECONDARY' | 'UNKNOWN';

function hostMatches(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some((s) => host === s || host.endsWith(`.${s}`));
}

/** Lower-case host without leading www/m/amp labels; null for internal-scheme or unparsable URLs. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase().replace(/^(www|m|amp)\./, '');
  } catch {
    return null;
  }
}

/** Classifies a URL host. Secondary wins over primary (for example an aggregator under gov.in is not expected). */
export function classifyHost(url: string): HostClass {
  const host = hostOf(url);
  if (host === null) return 'UNKNOWN';
  if (hostMatches(host, SECONDARY_HOST_SUFFIXES)) return 'SECONDARY';
  if (hostMatches(host, PRIMARY_HOST_SUFFIXES)) return 'PRIMARY';
  return 'UNKNOWN';
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/**
 * Canonical form used for de-duplication: https, lower-case host without www, no fragment, no default port,
 * tracking parameters dropped, remaining parameters sorted, no trailing slash. Returns null when the input is
 * neither an http(s) URL nor an internal document URL.
 */
export function canonicalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (text.startsWith(INTERNAL_DOC_SCHEME)) return text.length > INTERNAL_DOC_SCHEME.length ? text : null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === '') return null;
  const kept = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : '';
  const path = parsed.pathname.replace(/\/+$/, '');
  const port = parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443' ? `:${parsed.port}` : '';
  return `https://${host}${port}${path}${query}`;
}

/** SHA-256 hex of a canonical URL; the key of the URL cache. */
export function hashCanonicalUrl(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

/** Stored url_hash: scoped to the symbol because the table keeps one UNIQUE url_hash across all scrips. */
export function scopedUrlHash(symbol: string, canonicalUrl: string): string {
  return hashCanonicalUrl(`${symbol.trim().toUpperCase()}\n${canonicalUrl}`);
}
