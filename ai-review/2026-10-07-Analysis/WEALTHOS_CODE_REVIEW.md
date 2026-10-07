# WealthOS — Code Review & Refactor Plan (review-only, no code changed)

**Goal:** most efficient, responsive, contemporary, modular, maintainable, fast in execution.
**Reviewer-agent instruction:** treat each finding as a hypothesis. Verify against the cited file/line, then accept, reject or refine the stub. Do not apply changes that are not backed by a measurement or a cited line.

## 0. Scope and method (read this first)

The project root is `WealthOS 04 Oct/WealthOS 04 Oct/`. It holds roughly 1,000 source files plus about 550 loose root files, so a full read was not token-efficient. The method was:

1. Directory inventory (sizes per folder, top 40 largest files).
2. Regex metrics (route counts, hook counts, `any`, `SELECT *`, awaited-in-loop, empty `catch`, inline styles) on 8 core files.
3. Targeted reads (≤40 lines each) only where a metric flagged a problem.

**Files measured:** `server.ts`, `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/lib/apiClient.ts`, `src/server/database.ts`, `src/server/fifoEngine.ts`, `src/server/routes/infra.ts`, `DashboardView.tsx`, `OpportunityEngineMasterView.tsx`, `ImportsHubView.tsx`.

**NOT reviewed (reviewer should sample):** `src/server/services/**` (155 files in the top folder plus about 40 subfolders, about 5 MB), `src/mcp/**`, `src/components/**` other than the three above (about 85 files), `tests/`, `scripts/`, Python files, SQL schema.

Findings are therefore **systemic patterns**. They likely repeat in unreviewed code, so grep for the same patterns (section 9 has the commands).

## 1. Measured snapshot

| Metric | Value | Why it matters |
|---|---|---|
| `server.ts` | 17,224 lines, 764 KB, 239 routes, 77 imports | God file. Slow to load, review and test. |
| `server.ts` top-level functions | 36; largest are 2,868 / 1,940 / 1,761 / 1,731 lines | Business logic is inside the entry file. |
| `routes/infra.ts` | 4,167 lines, 228 routes, 212 `any` | Second god file, a "misc" router. |
| `database.ts` | 3,741 lines, 308 callback-style `.all/.get/.run`, many `PRAGMA table_info` migrations | Callback sqlite3 plus ad-hoc migrations. |
| `OpportunityEngineMasterView.tsx` | 9,617 lines, 89 `useState`, 1 `useMemo` | Re-renders the whole screen on any state change. |
| `DashboardView.tsx` | 2,486 lines, 251 `style={{}}` | Inline style objects are re-created every render. |
| `App.tsx` | 2,371 lines, 33 `useState`, 23 raw `fetch`, 8 `localStorage` | Shell, data layer and router in one file. |
| `any` | 523 in server.ts, 212 in infra.ts, 102 in OpportunityEngine view | Type safety is effectively off. |
| Awaited DB call inside `for` loop | 34 sites in `server.ts` (e.g. 680, 10371, 16472, 17057) | N+1 and per-row fsync, no transaction. |
| `SELECT *` | 55 in `server.ts` | Over-fetch, column drift. |
| Empty `catch {}` | 44 in `server.ts`, 6 in `database.ts` | Silent failures. |
| `console.log` | 88 in `server.ts` | Synchronous I/O, no levels. |
| DB size | `portfolio.db` ≈ 3.4 GB, `intraday_history.db` ≈ 8.8 GB | Query plans and indexes matter. |

## 2. Prioritised findings (impact ÷ effort)

| # | Finding | Impact | Effort | Section |
|---|---|---|---|---|
| P0-1 | Callback `sqlite3` driver on a 3.4 GB DB, while `better-sqlite3` is already a dependency | Very high (speed) | Medium | 3.1 |
| P0-2 | 34 per-row awaited writes with no transaction | Very high (speed) | Low | 3.2 |
| P0-3 | Open CORS `*` plus the 'Private-Network' header, no global auth, 0.0.0.0 default bind, 50 MB body for all routes | High (security) | Low | 4.1 |
| P1-4 | Decompose `server.ts` and `infra.ts` | High (maintainability) | High, incremental | 4.2 |
| P1-5 | Routers mounted multiple times, 7 duplicate route definitions | Medium (correctness) | Low | 4.3 |
| P1-6 | Versioned migrations instead of `PRAGMA table_info` per column | High (startup, safety) | Medium | 3.3 |
| P1-7 | Frontend data layer: TanStack Query instead of 23 raw fetches in `App.tsx`, 60-second polling | High (responsiveness) | Medium | 5.1 |
| P1-8 | Split the 9.6k-line view and the 2.4k-line dashboard; memoise, virtualise | High (responsiveness) | High, incremental | 5.2 |
| P2-9 | `any`, empty catch, `console.log` cleanup, typed errors, logger | Medium | Medium | 6 |
| P2-10 | Build: `manualChunks`, lazy Recharts, React Compiler | Medium | Low | 5.3 |
| P2-11 | Repo and dependency hygiene | Medium | Low | 7 |
| P3-12 | Dashboard cache: dedupe in-flight, ETag, SSE instead of polling | Medium | Low | 3.4 |

## 3. Data layer and performance

### 3.1 Replace callback `sqlite3` with `better-sqlite3` behind the existing helper signatures (P0-1)

**Evidence:** `database.ts:132-153` uses `new sqlite3.Database(...)` plus fire-and-forget `db.run("PRAGMA ...")`. `package.json` lists `sqlite3@5.1.7`, `better-sqlite3`, and `@libsql/client`, so three drivers are installed.

**Why:** `sqlite3` runs queries on a libuv thread pool and pays a callback hop per row. `better-sqlite3` is synchronous in-process and is typically several times faster for point and small-range queries. A 3.4 GB WAL database also benefits from `mmap_size`. Keep `dbAll/dbGet/dbRun` as the only public API so the 300+ call sites do not change.

```ts
// src/server/db/connection.ts  (NEW)
import Database from 'better-sqlite3';

let _db: Database.Database | null = null;

export function openDb(file: string): Database.Database {
  const db = new Database(file, { timeout: 30_000 });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -131072');       // 128 MB
  db.pragma('mmap_size = 2147483648');     // 2 GB, measure before keeping
  db.pragma('wal_autocheckpoint = 4000');
  db.pragma('foreign_keys = ON');
  return db;
}
export const getDB = () => (_db ??= openDb(getEffectiveDbPath()));

// src/server/db/helpers.ts  (NEW) — drop-in for current dbAll/dbGet/dbRun
const stmtCache = new WeakMap<Database.Database, Map<string, Database.Statement>>();
function prep(db: Database.Database, sql: string) {
  let m = stmtCache.get(db); if (!m) stmtCache.set(db, (m = new Map()));
  let s = m.get(sql); if (!s) m.set(sql, (s = db.prepare(sql)));
  return s;
}
export const dbAll = async <T = any>(db: Database.Database, sql: string, p: unknown[] = []) => prep(db, sql).all(...p) as T[];
export const dbGet = async <T = any>(db: Database.Database, sql: string, p: unknown[] = []) => prep(db, sql).get(...p) as T | undefined;
export const dbRun = async (db: Database.Database, sql: string, p: unknown[] = []) => prep(db, sql).run(...p);
export const tx = <T>(db: Database.Database, fn: () => T): T => db.transaction(fn)();
```

**Caveats for the reviewer:**
- Sync calls block the event loop. Move genuinely heavy jobs (FIFO recompute, backtests, history generation) to `worker_threads`, each worker opening its own read connection (see 3.5).
- `runInDbLock` (`database.ts:10`) exists to serialise async callbacks. With sync better-sqlite3 it becomes mostly unnecessary except around swap/restore.
- Statement caching assumes a bounded set of SQL strings. Do not cache dynamically built `IN (?,?,…)` strings without a cap (see `4649`, `6654`, `10464`).
- Benchmark before and after on `buildDashboardPayload`.

### 3.2 Batch writes in a single transaction (P0-2)

**Evidence:** `server.ts:10371` (is_cash_flow fix-up), `16472`, `680`, `10733`, `11336`, `11588`, `13481`, `16012`, `17057` and others `await dbRun` once per row with no `BEGIN`. Each autocommit is a WAL write.

```ts
// BEFORE (server.ts ~16472)
for (const tx of txns) {
  await dbRun(db, `INSERT INTO Transactions (...) VALUES (?,?,?,?,?,?,?,?,?,?)`, [...]);
}

// AFTER
const ins = db.prepare(`INSERT INTO Transactions (date,portfolio,type,isin,symbol,quantity,price,gross_amount,net_amount,notes)
                        VALUES (@date,@portfolio,@type,@isin,@symbol,@quantity,@price,@gross_amount,@net_amount,@notes)`);
db.transaction((rows: typeof txns) => { for (const r of rows) ins.run(r); })(txns);
```

```ts
// BEFORE (server.ts ~10371): SELECT then conditional UPDATE per row
// AFTER: set-based. Push the rule into SQL, or compute the delta list and run one transaction.
const fixes = newTxns
  .map(t => ({ id: t.id, v: expected(t) }))
  .filter((x, i) => x.v !== newTxns[i].is_cash_flow);
const upd = db.prepare('UPDATE Transactions SET is_cash_flow=? WHERE id=?');
db.transaction(() => fixes.forEach(f => upd.run(f.v, f.id)))();
```

Also replace the N+1 reads (`2855`, `4830`, `5651`, `7378`, `8331`, `12650`, `13960`, `13970`, `16315`) with one `WHERE x IN (…)` query or a `Map` pre-load. Chunk `IN` lists at 500 (already done at `10461`).

### 3.3 Versioned migrations (P1-6)

**Evidence:** `database.ts` calls `PRAGMA table_info(<table>)` and then conditionally `ALTER TABLE` about 20+ times at startup (e.g. 1651, 1659, 1869, 1879, 2291, 3049, 3205, 3214). `runMigrations` at 604 toggles `foreign_keys=off` and `on`. On a 3.4 GB DB, startup does a `quick_check` (`806`), which reads the whole file.

```ts
// src/server/db/migrations/index.ts (NEW)
export interface Migration { id: number; name: string; up(db: Database.Database): void }
export const migrations: Migration[] = [
  { id: 1, name: 'baseline',            up: db => db.exec(readSql('001_baseline.sql')) },
  { id: 2, name: 'holdings_native_val', up: db => db.exec('ALTER TABLE Holdings ADD COLUMN native_current_value REAL') },
];
export function migrate(db: Database.Database) {
  const cur = db.pragma('user_version', { simple: true }) as number;
  for (const m of migrations.filter(m => m.id > cur)) {
    db.transaction(() => { m.up(db); db.pragma(`user_version = ${m.id}`); })();
  }
}
```

- Run `PRAGMA quick_check` only after an unclean shutdown (WAL present and non-empty) or behind an `--integrity-check` flag, not every boot.
- Put the index list (`server.ts:16782` and `16946`, two copies) in one migration file.
- Add `PRAGMA optimize` on graceful shutdown and `ANALYZE` after bulk imports.

### 3.4 Query and index review (reviewer to confirm with `EXPLAIN QUERY PLAN`)

```sql
-- server.ts:2316 (buildDashboardPayload). The join condition uses OR-like guards that can defeat the index:
--   LEFT JOIN MasterTickers M ON (H.isin IS NOT NULL AND H.isin != '' AND M.isin = H.isin)
-- Rewrite so the planner can use idx_master_isin:
SELECT H.id, H.portfolio, H.symbol, H.isin, H.quantity, H.current_value, H.native_current_value, H.currency,
       M.name AS company_name, M.sector, COALESCE(P.base_currency,'INR') AS base_currency
FROM Holdings H
LEFT JOIN MasterTickers M ON M.isin = NULLIF(H.isin,'')
LEFT JOIN Portfolios   P ON P.name = H.portfolio
WHERE H.portfolio IN (?,?,?)
ORDER BY H.current_value DESC;

CREATE INDEX IF NOT EXISTS idx_master_isin   ON MasterTickers(isin);
CREATE INDEX IF NOT EXISTS idx_hold_port     ON Holdings(portfolio, current_value DESC);
CREATE INDEX IF NOT EXISTS idx_tx_port_batch ON Transactions(portfolio, batch_id);
CREATE INDEX IF NOT EXISTS idx_tx_port_date  ON Transactions(portfolio, date);
```

- Replace the 55 `SELECT *` with explicit columns on hot paths (Holdings, Transactions, MasterTickers).
- `H.*` in the dashboard payload ships every column to the client. Define a DTO.

**Dashboard cache (P3-12).** Today `dashboardResponseCache` (`server.ts:2229`) is a `Map` with a 3-minute TTL. Add in-flight de-duplication so concurrent identical requests share one computation, and use ETag so the client gets a 304.

```ts
// src/server/lib/swrCache.ts (NEW)
type Entry<T> = { v?: T; ts: number; p?: Promise<T> };
export function swr<T>(ttl: number, stale: number) {
  const m = new Map<string, Entry<T>>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const e = m.get(key) ?? { ts: 0 }; const age = Date.now() - e.ts;
    if (e.v !== undefined && age < ttl) return e.v;
    if (e.v !== undefined && age < stale) { if (!e.p) e.p = refresh(); return e.v; }
    return (e.p ??= refresh());
    function refresh() {
      return load().then(v => { m.set(key, { v, ts: Date.now() }); return v; })
                   .finally(() => { const c = m.get(key); if (c) c.p = undefined; });
    }
  };
}
// usage: const getDash = swr<DashboardDto>(180_000, 900_000);
// res.setHeader('ETag', etagOf(payload)); if (req.fresh) return res.sendStatus(304);
```

Replace the 60-second `setInterval(pollPriceTimestamp)` (`App.tsx:691`) with Server-Sent Events:

```ts
// server: GET /api/events  (text/event-stream); emit `data-changed` from invalidateAllCaches()
// client: new EventSource('/api/events').onmessage = () => queryClient.invalidateQueries();
```

### 3.5 Heavy compute off the request thread

Candidates (all in `server.ts`): `generateImmediateGrowthHistory` (2,868 lines), `getValuedHoldingsAsOfDate` (1,940), `purgePortfolioData`, `restoreDatabaseFromBuffer`, plus FIFO recompute and the regime backtest engine (`RegimeBacktestEngine.ts`, 86 KB).

```ts
// src/server/workers/pool.ts (NEW) — minimal piscina-style wrapper
import { Worker } from 'node:worker_threads';
export const runJob = <T>(name: string, payload: unknown) =>
  new Promise<T>((res, rej) => {
    const w = new Worker(new URL('./jobEntry.js', import.meta.url), { workerData: { name, payload } });
    w.once('message', res).once('error', rej).once('exit', c => c && rej(new Error(`worker ${c}`)));
  });
```

Each worker opens its own read-only better-sqlite3 handle (WAL permits concurrent readers).

## 4. Backend architecture and security

### 4.1 Security and middleware hardening (P0-3)

**Evidence:** `server.ts:161-179`. `Access-Control-Allow-Origin: *` plus `Allow-Private-Network: true`. Auth (`x-app-password`) is applied only to `/api/ai-studio-proxy` (line 190). Default bind is `0.0.0.0` (line 157). `express.json({limit:'50mb'})` applies globally. The password compare uses `!==`. `.env` sits in the project folder (it is git-ignored, but confirm it never shipped in the zips or bundles at the root).

```ts
// src/server/middleware/security.ts (NEW)
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'node:crypto';

export const security = [
  helmet({ contentSecurityPolicy: false }),
  cors({ origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','), credentials: true }),
  rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true }),
];

export function requireAuth(req, res, next) {
  const pw = process.env.APP_PASSWORD; if (!pw) return next();
  const got = Buffer.from(String(req.headers['x-app-password'] ?? ''));
  const exp = Buffer.from(pw);
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
// server bootstrap: app.use('/api', requireAuth)  // one place, not per router
// body limits: app.use(express.json({limit:'1mb'})); only multer upload routes keep large limits.
// BIND_HOST default: '127.0.0.1' unless the tunnel/remote bridge explicitly sets it.
```

Validate request bodies and query strings with zod (already a dependency):

```ts
export const validate = <T extends z.ZodTypeAny>(schema: T, where: 'body'|'query'|'params' = 'body') =>
  (req, res, next) => { const r = schema.safeParse(req[where]); if (!r.success) return res.status(400).json(r.error.flatten()); req[where] = r.data; next(); };
```

SQL injection posture: the 4 interpolated SQL strings found in `server.ts` use `?` placeholder lists and are safe. Reviewer should grep the remaining `routes/*.ts` and `services/**` for `${` inside SQL where the value is not a placeholder list.

### 4.2 Decompose `server.ts` and `infra.ts` (P1-4)

**Target layout:**

```
server.ts                      // ≤ 60 lines: load env, openDb, migrate, createApp, listen
src/server/app.ts              // createApp(): middleware + mountRoutes + errorHandler
src/server/routes/index.ts     // single registry (table below)
src/server/routes/<domain>.ts  // thin: parse → validate → call service → respond
src/server/services/<domain>/  // business logic (no express types)
src/server/repositories/       // SQL only (Holdings, Transactions, Masters…)
src/server/jobs/               // long-running work (worker threads)
```

```ts
// src/server/routes/index.ts (NEW) — one table replaces ~20 scattered app.use lines (server.ts:183-345)
const registry: Array<[string, Router]> = [
  ['/api/portfolios', portfoliosRouter], ['/api/transactions', transactionsRouter],
  ['/api/bank-fds', bankFdsRouter],      ['/api/forensic', forensicRouter],
  ['/api/strategies', strategiesRouter], ['/api/v1/quant', quantRouter], /* … */
];
export const mountRoutes = (app: Express) => registry.forEach(([p, r]) => app.use(p, r));
```

**Extraction order (lowest risk first):**
1. Move the 36 top-level functions out of `server.ts` into `services/` unchanged (pure move, no behaviour change). Start with `stringSimilarity` (line 66), `parseBankBookRecord`, `findExcelHeaderMap`, `getNiftyBenchmarkData`, `fetchSmallcapBenchmarkFromMFapi`.
2. Move the 239 inline `app.get/post` handlers into per-domain routers using the prefix distribution already in the file: `/api/pms` (19), `/api/admin` (17), `/api/corporate-actions` (12), `/api/tickers` (10), `/api/engine` (8), `/api/cams` (8), `/api/scrip-dossier` (7), `/api/holdings` (7).
3. Split `infra.ts` (228 routes) by its own prefixes: `/v1` (46), `/data-pipeline` (19), `/autonomous-agent` (17), `/sources` (13), `/greenfield` (12), `/opportunity-engine` (11).
4. Lock the contract before moving anything: generate a route snapshot (method + path + zod schema hash) and diff it after each step. `gen_map.ts` and `gen_snap.ts` at the root look like starting points.

**Handler wrapper to remove the 183 `try/catch` blocks in `infra.ts`:**

```ts
export const h = (fn: (req, res) => Promise<unknown>) => (req, res, next) => fn(req, res).catch(next);
router.get('/x', h(async (req, res) => res.json(await svc.x(req.query))));
// app-level
app.use((err, req, res, _next) => {
  req.log.error({ err }, 'unhandled'); res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'internal_error' });
});
```

### 4.3 Duplicate mounts and routes (P1-5)

**Evidence (`server.ts`):**
- `strategiesRouter` mounted at 185, 344 and 345 (`/api/strategies` twice, plus the alias).
- `bankFdsRouter` at 327 and 328 (`/api/bank-fds` and `/api`), `transactionsRouter` at 331 and 332, `reconciliationAuditRouter` at 336 and 337.
- Many routers mounted at bare `/api` (325, 328, 330, 332, 333, 339), so route resolution order matters and collisions are easy.
- Duplicate definitions: `GET /api/dashboard/effective-holdings`, `GET /api/scrip-intelligence`, `GET /api/tickers`, `POST /api/tickers/sync-sectors`, `POST /api/tickers/merge`, `GET /api/pms/reconcile-dividends`, `GET *` (only the first registered handler wins; the later ones are dead code).

**Fix:** keep one mount per router with its real prefix, move the alias into the router with an array path (`router.get(['/x','/legacy-x'], …)`), and add a CI check:

```ts
// scripts/check-routes.ts
const seen = new Map<string,string>();
for (const l of app._router.stack.flatMap(flatten)) { const k = `${l.method} ${l.path}`; if (seen.has(k)) throw new Error('duplicate '+k); seen.set(k,'1'); }
```

## 5. Frontend

### 5.1 Data layer and routing (P1-7)

**Evidence:** `App.tsx` has 23 raw `fetch(` calls (312, 703, 766, 797, 820, 848, 873, 898…), 33 `useState`, a hand-rolled `activeTab` state instead of a router, a 60 s poll, and a `window.dispatchEvent(new Event('portfolioDataChanged'))` global bus. `ImportsHubView` has 17 fetches and its own `setInterval` (line 380). There is also a typed `WealthOSApiClient` that most call sites bypass. Its remote-mode path rewriting is regex-based inside `request()`.

```tsx
// src/lib/queryClient.ts (NEW)  — npm i @tanstack/react-query
export const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 10*60_000, refetchOnWindowFocus: false, retry: 1 } } });

// src/features/portfolio/api.ts (NEW)
export const keys = { dash: (p: string[]) => ['dashboard', p] as const };
export const useDashboard = (p: string[]) =>
  useQuery({ queryKey: keys.dash(p), queryFn: ({ signal }) => api.get<DashboardDto>('/dashboard', { params: { p }, signal }) });

// mutation replaces fetch + manual window event:
export const useDeleteTx = () => useMutation({
  mutationFn: (id: number) => api.del(`/transactions/${id}`),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
});
```

```tsx
// src/routes.tsx (NEW) — replaces activeTab state; gives deep links, back button, per-route code splitting
const router = createBrowserRouter([
  { path: '/', element: <Shell />, errorElement: <RouteError />, children: [
    { index: true, lazy: () => import('./features/dashboard/route') },
    { path: 'portfolio', lazy: () => import('./features/portfolio/route') },
    { path: 'imports',   lazy: () => import('./features/imports/route') },
  ]},
]);
```

Make `apiClient` a thin function with `AbortSignal`, typed errors and a **data-driven** remote map instead of regex chains:

```ts
const REMOTE_MAP: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/scrip-dossier\/([^/]+)$/, m => `/company/${m[1]}/intelligence`],
  [/^\/portfolios\/([^/]+)$/,    m => `/portfolio/${m[1]}`],
];
```

### 5.2 Component size, re-renders and styling (P1-8)

**Evidence:** `OpportunityEngineMasterView.tsx` is a single 9,617-line component with 89 `useState` and one `useMemo`. Every keystroke or toggle re-renders the entire tree. `DashboardView.tsx` has 251 inline `style={{}}` objects. 14 `key={index}` usages in the opportunity view, 2 in imports.

**Pattern to apply (per tab, per panel):**

```tsx
// BEFORE: 89 useState in one component
// AFTER: feature folder + one reducer/store per feature, selectors for slices
src/features/opportunity/
  OpportunityPage.tsx          // layout only
  store.ts                     // zustand or useReducer
  tabs/ScanTab.tsx  tabs/BacktestTab.tsx …   // each React.lazy, each ≤ 400 lines
  hooks/useScan.ts             // react-query
```

```tsx
// store.ts (zustand) — components subscribe to slices, not the whole state
export const useOpp = create<OppState>()((set) => ({ filters: defaults, setFilter: (k, v) => set(s => ({ filters: { ...s.filters, [k]: v } })) }));
const minScore = useOpp(s => s.filters.minScore);   // re-renders only when this changes
```

- Wrap list rows in `React.memo` and virtualise tables over about 200 rows (`@tanstack/react-virtual`).
- Use stable ids for `key`, not the index.
- `useTransition` for heavy tab or filter changes so input stays responsive.
- Compute derived data with `useMemo` or on the server. The sort/filter/aggregate chains inside render bodies are the likely hotspot (`OpportunityEngineMasterView` has 67 `.map(` calls and one `useMemo`).
- Move the 251 inline styles in `DashboardView` to Tailwind utilities (Tailwind v4 is already installed via `@tailwindcss/vite`) or CSS variables. Keep inline `style` only for truly dynamic values (e.g. bar widths).

```tsx
// BEFORE
<div style={{ display:'flex', gap:12, padding:'8px 12px', background:'var(--card)' }}>
// AFTER
<div className="flex gap-3 px-3 py-2 bg-[var(--card)]">
```

Enable the React Compiler to auto-memoise (React 19 is already used):

```ts
// vite.config.ts
react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })
```

### 5.3 Build config and bundle (P2-10)

**Evidence:** `vite.config.ts` has no `manualChunks`. `DashboardView` imports Recharts eagerly. `main.tsx` imports `ThemeSelectorModal.js` just to call `applyTheme`, which pulls the modal into the entry chunk. `alias '@' → '.'` plus tsconfig `paths '@/*' → './*'`. The `src/server/**` path is excluded from the watcher, which is fine, but note that server-side edits are not hot reloaded.

```ts
// vite.config.ts
build: {
  target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600,
  rollupOptions: { output: { manualChunks: {
    react: ['react','react-dom'], charts: ['recharts'], motion: ['motion'], xlsx: ['xlsx','exceljs'],
  }}},
},
// Heavy libs on demand only:  const XLSX = await import('xlsx');
```

```ts
// src/lib/theme.ts (NEW, ~15 lines, no modal import) — used by main.tsx to avoid pulling the modal into the entry chunk
export const applyTheme = (id: string) => { document.documentElement.dataset.theme = id; };
```

```ts
// main.tsx — scope the error suppression to dev only; it currently hides every error containing "vite" or "websocket" in production too
if (import.meta.env.DEV) { /* existing suppression */ }
// and remove `// @ts-ignore` on GoogleOAuthProvider by typing import.meta.env in vite-env.d.ts
```

Also: the dummy Google client id fallback (`'1234567890-dummy…'`) should fail loudly in production builds, and `index.html` should preload only the entry chunk.

## 6. Code quality and type safety (P2-9)

1. **Types.** `tsconfig.json` has no `"strict"`. Turn on incrementally with a per-folder config (`tsconfig.strict.json` including only migrated folders) and a ratchet script that fails CI if the `any` count rises. `routes/infra.ts` (212 `any`) and `database.ts` (87) are first. Derive request and response types from zod (`z.infer`) and share them between server and client via `src/shared/`.
2. **Errors.** 44 empty `catch (e) {}` in `server.ts` (e.g. 1283, 1327, 2237–2248). Each should at least `log.warn`. Real cache-invalidation failures should not be swallowed silently.
   ```ts
   const safe = async <T>(fn: () => Promise<T>, ctx: string, fallback?: T) => { try { return await fn(); } catch (err) { log.warn({ err, ctx }); return fallback as T; } };
   ```
3. **Logging.** 88 `console.log` in `server.ts`. Use `pino` with levels and a request id; it is async and cheap.
4. **Config.** 29 direct `process.env.*` reads in `server.ts`. Centralise in `src/server/config.ts` with a zod-parsed schema that fails fast at boot.
5. **Magic values.** `usdRate = fxRates.USD || 83.5` (`server.ts` buildDashboardPayload) hides a missing FX feed behind a stale constant. Surface "FX unavailable" instead.
6. **Dead and duplicate code.** `gen_map.js` and `gen_map.ts`, `server.research.ts`, `scratch_test.ts`, `test_resolver.ts`, `routes.ts` (41 bytes, a stub) at `src/server/routes.ts`. Confirm and remove.
7. **Tests.** Both Jest (`jest.config.cjs`) and Vitest are configured, and `package.json` mixes `jest` scripts, `vitest` scripts, `tsx scripts/run_tests.ts` and `node tests/run-all-tests.mjs`. Consolidate on Vitest and keep Playwright for e2e. Add a **golden-master test** for `buildDashboardPayload` and the FIFO/XIRR engines before any refactor in section 4. These are financial calculations, and the refactor must not change numbers.

## 7. Repository and dependency hygiene (P2-11)

**Root folder:** about 550 loose files, and about 60 dot-folders for different AI coding tools (`.adal`, `.aider-desk`, `.augment`, `.bob`, `.codebuddy`, … `.zencoder`). Large non-source files sit beside the code: `portfolio.db` (3.4 GB), `intraday_history.db` (8.8 GB), `portfolio_persistent_backup.db` (3.4 GB), `git_log_all.txt` (183 MB), `repomix-output.xml` (104 MB), `cloudflared.exe` (55 MB), multiple `.zip` bundles, and raw broker CSV/XLS exports. These are git-ignored, but they slow IDE indexing, repomix, backups and any review agent.

**Proposed layout:**

```
/                 server.ts, package.json, configs only
/src              app code (client, server, mcp, shared)
/scripts          one-off .cjs/.py/.bat/.ps1 (about 80 files now at root) → scripts/maintenance, scripts/recon, scripts/ops
/docs             all *.md specs, phase reports, dossiers (about 70 at root)
/data (ignored)   *.db, CSV/XLS imports, backups, zips
/tools            cloudflared and others
```

**package.json:**
- Three SQLite drivers (`sqlite3`, `better-sqlite3`, `@libsql/client`). Keep one (see 3.1).
- Two Google AI SDKs (`@google/genai` and `@google/generative-ai`). Keep `@google/genai`.
- Two spreadsheet libraries (`xlsx` 0.18.5 and `exceljs`). `xlsx@0.18.5` on npm has known unpatched advisories. Prefer `exceljs` or the SheetJS CDN build, and load on demand.
- Build-time and type packages in `dependencies`: `typescript`, `vite`, `esbuild`, `tsx`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@types/*`, `playwright`. Move to `devDependencies` so production installs are smaller.
- `node-fetch` is redundant on Node ≥ 18 (global `fetch`). `axios` sits in devDependencies and may duplicate it.
- `firebase`, `@aws-sdk/client-bedrock-runtime`, `nodemailer`, `kiteconnect`, `youtube-transcript`, `rss-parser` are heavy. Confirm each is imported (`npx knip` or `depcheck`) and lazy-import server-side ones to cut cold start.
- `"main": "electron/main.cjs"` but no `electron` dependency is listed in the visible part of the file. The Capacitor and Electron paths need an owner or removal.
- 40+ npm scripts. Group under `scripts/` entrypoints with a README table.

**Startup and build:** `npm run build` bundles `server.ts` with esbuild but keeps `--packages=external`, so `node_modules` must ship. Native modules (`better-sqlite3`) need a matching ABI on the target machine.

## 8. Suggested execution order for the implementing agent

1. **Safety net (day 1):** golden-master tests for dashboard payload, FIFO, XIRR. Route snapshot script. Baseline timings of the 10 slowest endpoints (log with `performance.now()`).
2. **P0 (week 1):** 3.2 transactions on batch writes, 4.1 security middleware, 3.1 better-sqlite3 behind the same helpers. Re-run the golden tests after each.
3. **P1 backend (week 2–3):** 4.3 de-duplicate mounts, 3.3 migrations, then 4.2 extraction (pure moves first).
4. **P1 frontend (week 2–4, parallel):** 5.1 TanStack Query plus router, then split the opportunity view tab by tab.
5. **P2:** 5.3 build config, section 6 type ratchet, section 7 hygiene.

## 9. Verification commands for the reviewer agent

```bash
# per-row awaited writes (candidate N+1 / missing transaction)
grep -nE "for \(.*\) \{" -A4 server.ts src/server/**/*.ts | grep -E "await (dbRun|dbGet|dbAll)"
# empty catches
grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" src server.ts | wc -l
# interpolated SQL (verify only placeholder lists)
grep -rnE "(dbAll|dbGet|dbRun)\(db,\s*\`[^\`]*\\$\{" src server.ts
# any ratchet
grep -rnE ":\s*any\b|as any" src server.ts | wc -l
# oversize files
find src -name "*.ts*" -size +100k -exec ls -lh {} \;
# unused deps
npx knip && npx depcheck
# plan check for hot queries
sqlite3 portfolio.db "EXPLAIN QUERY PLAN <paste query>;"
```

## 10. Assumptions and open questions

- Numbers above come from regex counts, not an AST, and may over- or under-count slightly (e.g. `any` also matches inside comments).
- Whether `better-sqlite3` is already loaded elsewhere (e.g. services) was not checked. The migration plan assumes `sqlite3` is the main path.
- Whether the Electron or Capacitor packaging is still in use is unknown. This changes the answer on bundling and on `0.0.0.0` binding.
- The remote bridge (`/api/ai-studio-proxy`, cloudflared tunnel) means the server may be reachable from outside the machine. That raises the priority of 4.1.
- No business-logic review of FIFO, XIRR, tax or reconciliation was done. That needs a domain-aware pass with fixtures.
