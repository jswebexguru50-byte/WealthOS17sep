# Deterministic fundamental-filter daemon

The phase-1 worker evaluates the seven mandatory strategy filters using only evidence already stored in `portfolio.db`:

1. promoter holding > 66.6%
2. positive PAT in each of the last eight quarterly PL rows
3. ROCE >= 35%
4. ROE >= 25%
5. pledged percentage exactly 0%
6. FII + DII involvement > 0 (and a separate increasing-involvement indicator when two periods exist)
7. latest positive CFO / operating profit >= 50%

Unavailable values remain `NULL` and fail closed. The worker never invents values, calls an LLM, or treats a registry match as proof. QGLP, sunrise/PLI, sector-vs-stock momentum, and buyer-detail enrichment are explicitly queued for phase 2.

## Run

One resumable batch (useful for a scheduled job):

```powershell
$env:NODE_OPTIONS='--require=./scripts/node_userinfo_fallback.cjs'
npm run fundamental:filters -- --once --batch-size 25
```

Long-running daemon with automatic re-evaluation every 15 days:

```powershell
$env:NODE_OPTIONS='--require=./scripts/node_userinfo_fallback.cjs'
npm run fundamental:filters -- --daemon --interval-ms 60000 --refresh-days 15
```

Useful options: `--scan-id <id>`, `--max-symbols <n>` (test throttling), `--refresh` (explicit full re-evaluation), and `--auto-refresh false` (disable the 15-day policy).

## Durable outputs

- `data/fundamental_enrichment/filter_enrichment_progress.json` — atomic checkpoint/status used by the UI.
- `data/fundamental_enrichment/filter_enrichment_manifest.jsonl` — one auditable line per evaluated symbol.
- `data/fundamental_enrichment/filter_enrichment.log` — process log.
- SQLite table `strategy_fundamental_filter_results` — upserted filter facts and provenance.
- `GET /api/fundamental-enrichment/progress` — read-only status endpoint.

The lock file prevents duplicate workers. A restart reads the checkpoint and skips symbols already persisted for the same scan, unless the 15-day refresh is due or `--refresh` is supplied.
