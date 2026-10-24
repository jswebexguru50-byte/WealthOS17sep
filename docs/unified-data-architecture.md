# Unified data architecture

All production consumers — Seven scanners, F1–F7, 29Q and ITAS publishing — must read canonical facts through `UnifiedDataResolver`. Acquisition adapters only create/advance `acquisition_jobs`; they do not produce user-facing reports directly.

Lifecycle: `QUEUED → FETCHING → FETCHED → NORMALIZED → PROMOTED → CONSUMED`. A retryable source error retains the cache key and retry time. A fetched payload cannot be fetched again inside its policy TTL while promotion is pending.

Metric-level source policy is stored in `source_metric_policy`. It gives statutory NSE/BSE XBRL priority for reported statements, while allowing labelled Trendlyne facts to be promoted and used immediately as structured secondary evidence. Primary filings supersede, rather than block, those facts.

BSE numeric identifiers route to the BSE adapter; alphabetic symbols route to NSE. Both must resolve to the MasterTickers ISIN before canonical promotion.
