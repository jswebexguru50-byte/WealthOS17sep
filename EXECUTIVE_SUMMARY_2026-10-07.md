# WealthOS Skills & Reviews Map — Executive Summary
**Date:** 2026-10-07 | **Status:** All skills loaded, reviews consolidated, graphify analysis complete

---

## 🎯 What Was Done

### 1. **Skills Inventory** (7 skills loaded)
- ✅ **graphify** — Deterministic AST pass (0 LLM cost) built 75-file dependency graph
- ✅ **performance-optimization** — Used for N+1 & cache analysis
- ✅ **observability-and-instrumentation** — Timing middleware stubs identified
- ✅ **using-agent-skills** — Meta-skill for scope-aware selection
- ✅ **ponytail** — Simplicity discipline applied to review method
- ✅ **OmniRoute** — Provider discovery (not used this session)
- ✅ **tradingagents** — Research-only mode confirmed

### 2. **Reviews Consolidated** (3 major reviews, 2026-10-07)

| Review | Finding Count | Files | Key Insights |
|--------|---------------|-------|--------------|
| **Graphify Map** | 1,383 nodes analyzed | 75 files | Import cycle, god nodes (getDB 104 edges), 58 communities |
| **Code Review** | 12 prioritized findings | server.ts, infra.ts, components | P0: replace sqlite3, batch writes; P1: split god files, secure CORS |
| **Bottleneck Audit** | 7 critical issues | database.ts, dashboardPayload | B1: serialized DB ops, B3: cold load 25 awaits, B7: 3.4 GB backup storm |

### 3. **Graphify Map** (Interactive HTML visualization)
- Generated: `WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html` (viewable in browser, dark theme, responsive)
- Shows: Skills catalog, architecture layers, metrics, god nodes, quick wins
- Includes: All 12 code findings + 7 bottlenecks ranked by impact÷effort

### 4. **Memory Saved** (For future sessions)
```
C:\Users\GopalSharma\.claude\projects\C--Users-GopalSharma-Downloads-WealthOS-04-Oct\memory\
├── MEMORY.md (index)
├── wealthos_reviews_skills_map_20261007.md (comprehensive catalog)
└── project_architecture.md (module layers & structural findings)
```

---

## 📊 Key Numbers

### Graphify Stats
- **75 files analyzed** | **1,383 nodes** | **2,695 edges** | **58 communities**
- **97% extracted** (AST) | **3% inferred** (0.85 confidence)
- **Top 5 god nodes:** getDB (104), dbRun (84), dbAll (82), dbGet (69), ConsolidatedOpportunityEngine (38)

### Code Metrics
| Category | Metric | Issue |
|----------|--------|-------|
| God files | server.ts (17k LOC) + infra.ts (4.2k) | Decomposition needed |
| Type safety | 523 `any` in server.ts, 212 in infra.ts | No static verification |
| Error handling | 44 empty `catch {}`, 88 `console.log` | Silent failures, sync I/O |
| Views | OpportunityEngineMasterView (9.6k), DashboardView (2.5k) | Over-renders on any state change |

### Database Issues
| Size | Issue | Impact |
|------|-------|--------|
| 3.4 GB | One callback `sqlite3` connection | Serializes all DB ops |
| 3.4 GB | Copied after every write (B7) | Evicts cache, competes with reads |
| 159 indexes | 14 exact duplicates, 22 redundant | Planner heuristics fail |
| 100+ tables | No `ANALYZE` / `PRAGMA optimize` | Statistics missing |

### Bottlenecks (by impact)
1. **B1:** Single DB connection serializes everything (critical)
2. **B3:** 25 serial awaits in dashboard cold load (critical)
3. **B7:** 3.4 GB backup copies evict cache (critical)
4. **B4:** 159 duplicate indexes (critical)
5. **B5:** Per-row writes with no transaction (high)

---

## 🚀 Recommended Action Plan

### Immediate (1 day, high ROI)
- [ ] Remove B7 backup trigger from dbRun (1 line)
- [ ] Remove 7 duplicate routes (consolidate)
- [ ] Fix CORS: restrict origins, add auth gate, lower 50 MB body limit
- [ ] Run `index_migration_PROPOSED.sql` on DB copy (remove 14 duplicates)

### Short-term (3–5 days, visible perf)
- [ ] Batch writes: wrap 34 loops in BEGIN…COMMIT (P0-2)
- [ ] Smart cache invalidation: only affected portfolios (B2)
- [ ] Read pool: 3 read-only connections for parallel reads (B1 partial)
- [ ] ANALYZE + PRAGMA optimize on startup (B4)

### Medium-term (2–3 weeks, 10x speedup)
- [ ] Migrate `sqlite3` → `better-sqlite3` via `dbAll/dbRun/dbGet` API (P0-1)
- [ ] Parallelize 25 awaits in `buildDashboardPayload` with `Promise.all` (B3)
- [ ] Convert PRAGMA migrations to versioned v1..vN (P1-6)
- [ ] TanStack Query for 23 raw fetch calls (P1-7)

### Long-term (1–2 months, maintainability)
- [ ] Decompose server.ts (17k) & infra.ts (4.2k) into domain routers (P1-4)
- [ ] Split OpportunityEngineMasterView (9.6k) + memoize, virtualize (P1-8)
- [ ] Cleanup: 523 `any` → typed errors, 44 empty catch → logged, logger (P2-9)

---

## 📁 Generated Artifacts (All in Project Root)

### Maps & Visualizations
1. **WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html** ← **Open this for visual tour**
   - Dark theme, responsive grid layout
   - Skills, god nodes, findings, bottlenecks, quick wins all in one page

2. **graphify_GRAPH_REPORT.md** (from graphify skill, 330 lines)
   - Community hubs, isolated nodes, suggested graph queries

3. **graphify_graph.html** (interactive graph visualization, 1.2 MB)
   - Force-directed graph; zoom/pan; node/edge inspection

4. **WEALTHOS_MIND_MAP.html** (module layer diagram)
   - Visual breakdown of client, API, portfolio core, market data, intelligence layers

### Reviews & Analysis
1. **WEALTHOS_CODE_REVIEW.md** (200 lines)
   - 12 prioritized findings (P0-P3)
   - Metric-driven, targeted reads only (not full-file)

2. **WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md** (150 lines)
   - 7 critical performance issues (B1–B7)
   - Query plans, index analysis, fix sketches in SQL/TS

3. **index_migration_PROPOSED.sql** (not applied)
   - Removes 14 exact-duplicate indexes
   - Consolidates left-prefix redundant indexes
   - Safe to apply on a DB copy first

4. **diagnose_db.sql** (read-only checks)
   - Schema validation, index usage verification

### Memory (For future sessions)
1. **memory/MEMORY.md** (index)
2. **memory/wealthos_reviews_skills_map_20261007.md** (comprehensive, 15 KB)
3. **memory/project_architecture.md** (architecture & layers, 8 KB)

---

## 🔍 Key Findings Summary

### Architecture
- **75 files, 1,383 nodes** analyzed via graphify
- **7 module layers:** Client (React), Routes (Express 239), Portfolio Core (8 services), Import (4 parsers), Market Data (4), Intelligence (8 engines), Data Layer (1 callback SQLite)
- **Import cycle:** database.ts ↔ xirr.ts ↔ fifoEngine.ts (fixable, no hard dependency)
- **Routes bypass services:** 34 dbRun call sites in server.ts (violates CLAUDE.md)

### Performance (Bottlenecks)
- **B1:** One callback SQLite connection serializes all DB ops (critical)
- **B3:** Dashboard cold load = 25 serial awaits, 10+ sec latency
- **B7:** 3.4 GB full-DB copy after every write, evicts OS page cache
- **B4:** 159 overlapping indexes, 14 exact duplicates, 22 redundant
- **B5:** 34 per-row writes with no transaction (each = own fsync)

### Code Quality
- **523 `any` types** in server.ts (no static verification)
- **God files:** server.ts (17k) + infra.ts (4.2k)
- **44 empty `catch {}`** blocks (silent failures)
- **Duplicate routes:** 7 exact copies across routers
- **View over-renders:** OpportunityEngineMasterView (89 useState, 1 useMemo) re-renders entire UI on any state

### Security (P1-3)
- **Open CORS:** `*` (allow all origins)
- **No global auth gate** before sensitive routes
- **50 MB body limit** on all endpoints (allows large malicious payloads)
- **0.0.0.0 bind** (not restricted to localhost)

---

## 📋 Validation Checklist (Before Applying Fixes)

- [ ] Confirm DB size: `SELECT page_count * page_size / 1e9 FROM pragma_page_count, pragma_page_size`
- [ ] Run EXPLAIN QUERY PLAN on top 10 queries (from server logs)
- [ ] Confirm table row counts (Transactions, HistoricalPrices, Holdings)
- [ ] Benchmark `buildDashboardPayload` before/after each fix
- [ ] Test backup consistency under concurrent writes
- [ ] Profile dashboard load time (first render, cold cache)

---

## ✨ Next Session Recommendations

1. **Review & confirm findings** with team
2. **Prioritize security fix** (P1-3: CORS, auth, body limit) — do first
3. **Pick one quick win** (remove B7 backup trigger) — 1 hour, immediate benefit
4. **Schedule medium-term work** (batch writes, cache invalidation, read pool)
5. **Benchmark before/after** on portfolio.db copy (never on prod data)

---

## 📞 Questions This Map Answers

1. **"Which skills are available?"** → 7 listed; graphify, performance-optimization, observability already applied
2. **"What reviews were done today?"** → 3: graphify (1.3k nodes), code review (12 findings), bottleneck audit (7 issues)
3. **"Where are the bottlenecks?"** → B1–B7 ranked by impact; B7 is quick win (1 line)
4. **"What's the next priority?"** → Security (P1-3), then B7 removal, then batching writes (P0-2)
5. **"Is the code maintainable?"** → No: god files (17k + 4.2k), 523 `any`, import cycle, routes bypass services

---

**Last updated:** 2026-10-07 · **Next review:** Before starting refactoring work · **Team:** Review findings, confirm measurements, prioritize fixes
