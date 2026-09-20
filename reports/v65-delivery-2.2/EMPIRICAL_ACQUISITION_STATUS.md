# Empirical Acquisition Status

## Status: BLOCKED

### Justification
Live empirical acquisition via the `UpstoxIntradayIngestor` remains explicitly and intentionally `BLOCKED` in Lane B. No modifications have been made to circumvent API authentication requirements or artificially synthesize empirical data.

### Static Assurances Verified
Although live acquisition is blocked, static architectural guarantees for the ingestor framework have been verified without live side-effects:

1. **Chunk Boundaries**: Deterministic mapping of requested date ranges into non-overlapping boundaries matching Upstox limits.
2. **Maximum-Window Enforcement**: Automated batching strictly partitions large requests into sizes ≤ 2 years (or 1-month intraday windows).
3. **Calendar-Awareness**: Static chunk boundaries do not invent days, avoiding artificial gaps.
4. **No Test Data Forgery**: No empirical historical datasets were fabricated to simulate acquisition success.

### Resolution Path
Empirical data acquisition will remain blocked until a dedicated downstream capability integrates authentic M2M/Trading token infrastructure and initiates authorized ingest.
