# 📑 WealthOS Skills & Reviews Index (2026-10-07)
**Complete catalog of all skills loaded, reviews completed, and analysis artifacts**

---

## 🎯 Start Here

👉 **Visual Map (Interactive):** [`WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html`](WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html)
- Dark theme, responsive grid layout
- All skills, reviews, findings, metrics in one page
- Open in browser for full experience

📋 **Executive Summary:** [`EXECUTIVE_SUMMARY_2026-10-07.md`](EXECUTIVE_SUMMARY_2026-10-07.md)
- What was done, key numbers, action plan
- Recommended next steps, validation checklist

---

## 🔧 Skills Loaded (7 Total)

| Skill | Purpose | Status | Used In |
|-------|---------|--------|---------|
| **graphify** | Deterministic AST, 0 LLM cost, builds dependency graph | ✅ Applied | graphify_GRAPH_REPORT.md, graphify_graph.html |
| **performance-optimization** | Measure → locate → fix → verify. N+1, cache patterns | ✅ Applied | WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md |
| **observability-and-instrumentation** | Timing middleware, logger integration | ✅ Identified | Recommended for B1–B7 fixes |
| **using-agent-skills** | Meta-skill for scope-aware skill selection | ✅ Enabled | This session (selected relevant skills) |
| **ponytail** | Simplicity & context-economy discipline | ✅ Applied | Review method: metric-driven, targeted |
| **OmniRoute** | Provider discovery, health checks, fallback routing | ⏸️ Available | Not needed this session |
| **tradingagents** | Research & analysis only, no live execution | ⏸️ Available | Not needed this session |

---

## 📊 Reviews Completed (3 Major, Today)

### 1. Graphify Analysis
**File:** [`graphify_GRAPH_REPORT.md`](graphify_GRAPH_REPORT.md) | 330 lines | 2026-10-07 7:47:40 AM

**What:** Deterministic module dependency graph from 75 staged files
**Coverage:**
- 1,383 nodes analyzed
- 2,695 edges mapped
- 58 communities discovered
- 97% extracted, 3% inferred (0.85 avg confidence)

**Key Findings:**
- 5 god nodes: getDB (104 edges), dbRun (84), dbAll (82), dbGet (69), ConsolidatedOpportunityEngine (38)
- Import cycle: database.ts ↔ xirr.ts ↔ fifoEngine.ts
- 58 communities including infra.ts (0.029 cohesion), server.ts (0.031), PureTechnicalStrategiesEngine (0.054)
- 405 isolated nodes (possible documentation gaps)

**Interactive Visualization:** [`graphify_graph.html`](graphify_graph.html) (1.2 MB, force-directed graph, clickable nodes)

---

### 2. Code Review
**File:** [`WEALTHOS_CODE_REVIEW.md`](WEALTHOS_CODE_REVIEW.md) | 200+ lines | 2026-10-07 7:40:13 AM

**Method:** Metric-driven, targeted reads (≤40 lines) on 15 core files
- Regex metrics on: server.ts, package.json, vite.config.ts, tsconfig.json, index.html, App.tsx, DashboardView.tsx, OpportunityEngineMasterView.tsx, etc.
- NOT fully reviewed: 155 services, 85 components, tests, scripts (reviewed for patterns, not exhaustive)

**Findings:** 12 prioritized issues

| Priority | Count | Issues | Impact | Effort |
|----------|-------|--------|--------|--------|
| **P0** | 2 | Replace sqlite3 → better-sqlite3; batch writes | Very High | Low-Medium |
| **P1** | 6 | Secure CORS; decompose god files; remove duplicates; migrations; data layer | High | Medium-High |
| **P2** | 3 | Cleanup `any`, empty catch, console.log; build optim; hygiene | Medium | Low-Medium |
| **P3** | 1 | Dashboard cache (in-flight dedup, ETag, SSE) | Low | Low |

**Top Metrics:**
- `server.ts`: 17,224 LOC, 764 KB, 239 routes, 77 imports, 523 `any`, 44 empty catch
- `infra.ts`: 4,167 LOC, 228 routes, 212 `any`
- `OpportunityEngineMasterView.tsx`: 9,617 LOC, 89 useState, 1 useMemo (over-renders)
- `DashboardView.tsx`: 2,486 LOC, 251 inline styles
- `App.tsx`: 2,371 LOC, 33 useState, 23 raw fetch, 8 localStorage

---

### 3. Bottleneck & Performance Audit
**File:** [`WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md`](WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md) | 150+ lines | 2026-10-07 7:47:38 AM

**Method:** Static analysis + schema inspection (no runtime profile available)

**Findings:** 7 critical issues

| ID | Issue | Root Cause | Impact | Fix Effort |
|----|-------|-----------|--------|------------|
| **B1** | Single DB connection serializes all ops | Callback `sqlite3`, one getDB() | Critical | Low-Medium (add read pool) OR Medium (better-sqlite3) |
| **B2** | Cache invalidation too coarse | registerFifoCompletedCallback clears all | High | Low |
| **B3** | 25 serial awaits on cold dashboard load | buildDashboardPayload 959 lines, full-table SELECT | Critical | Medium |
| **B4** | 159 duplicate/redundant indexes | 14 exact duplicates, 22 left-prefix redundant | Critical | Low (run migration) |
| **B5** | Per-row awaited writes, no transaction | 34 for loops with `await dbRun` each | High | Low (wrap in BEGIN…COMMIT) |
| **B7** | 3.4 GB full-DB copy after every write | createPersistentBackup() in dbRun callback | Critical | Low (remove trigger, schedule 6h) |
| **B6** | (N+1 reads, unfiltered SELECT) | Missing WHERE, OR conditions defeat index | High | Medium |

**Schema & Index Audit:** [`index_migration_PROPOSED.sql`](index_migration_PROPOSED.sql) (not applied)
- Remove 14 exact-duplicate indexes
- Consolidate 22 left-prefix redundant indexes
- Safe to apply on portfolio.db copy first

**Diagnostics:** [`diagnose_db.sql`](diagnose_db.sql) (read-only checks for validation)

---

## 📁 Artifact Map (All in Project Root)

### Primary Outputs (Today, 2026-10-07)

| File | Type | Size | Purpose | View With |
|------|------|------|---------|-----------|
| **WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html** | HTML | 25 KB | **← Visual map** of all findings, metrics, skills | Browser (dark theme) |
| **EXECUTIVE_SUMMARY_2026-10-07.md** | Markdown | 8 KB | Action plan, quick wins, validation checklist | Text editor or Markdown viewer |
| **INDEX_SKILLS_REVIEWS_2026-10-07.md** | Markdown | This file | Complete index & navigation | Text editor |
| graphify_GRAPH_REPORT.md | Markdown | 330 lines | Detailed graph analysis, communities, isolated nodes | Text editor |
| graphify_graph.html | HTML | 1.2 MB | Interactive force-directed graph (zoom, pan, inspect) | Browser |
| WEALTHOS_MIND_MAP.html | HTML | 17 KB | Module layer diagram (client, routes, services, data) | Browser |
| WEALTHOS_CODE_REVIEW.md | Markdown | 200+ lines | 12 prioritized code findings with metrics | Text editor |
| WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md | Markdown | 150+ lines | 7 performance bottlenecks with fix sketches | Text editor |
| index_migration_PROPOSED.sql | SQL | 5.4 KB | Index cleanup (14 duplicates removed) | SQL editor or Text editor |
| diagnose_db.sql | SQL | 2.5 KB | Read-only schema validation checks | SQL client or Text editor |

### Memory (For Future Sessions)

| File | Purpose | Saved To |
|------|---------|----------|
| wealthos_reviews_skills_map_20261007.md | Comprehensive skills catalog, reviews, findings | `memory/` |
| project_architecture.md | Module layers, god nodes, critical paths | `memory/` |
| MEMORY.md | Index of memory files | `memory/` |

---

## 🗺️ Navigation Guide

### If you want to...

**📊 See everything at once:**
→ Open [`WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html`](WEALTHOS_SKILLS_REVIEWS_MAP_2026-10-07.html) in browser

**📋 Understand the action plan:**
→ Read [`EXECUTIVE_SUMMARY_2026-10-07.md`](EXECUTIVE_SUMMARY_2026-10-07.md)

**🔍 Deep-dive on architecture:**
→ Read [`WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md`](WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md) (module map, section 1)

**🚀 Find quick wins:**
→ [`EXECUTIVE_SUMMARY_2026-10-07.md`](EXECUTIVE_SUMMARY_2026-10-07.md) → "Immediate (1 day)"

**💻 See code findings:**
→ [`WEALTHOS_CODE_REVIEW.md`](WEALTHOS_CODE_REVIEW.md) → Section 2 (12 findings)

**⚡ See perf bottlenecks:**
→ [`WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md`](WEALTHOS_LOAD_BOTTLENECK_AND_INDEX_REVIEW.md) → Section 2 (B1–B7)

**📈 Explore module graph interactively:**
→ Open [`graphify_graph.html`](graphify_graph.html) in browser (zoom, pan, click nodes)

**🎯 Get started on fixes:**
→ Read [`EXECUTIVE_SUMMARY_2026-10-07.md`](EXECUTIVE_SUMMARY_2026-10-07.md) → "Recommended Action Plan"

---

## 📈 Key Numbers (Quick Reference)

### Graphify
- **75 files** | **1,383 nodes** | **2,695 edges** | **58 communities**
- **Top god node:** `getDB()` with 104 edges
- **Import cycle:** database.ts ↔ xirr.ts ↔ fifoEngine.ts

### Code Quality
- **17,224 lines** in server.ts (god file)
- **523 `any` types** (no static verification)
- **44 empty `catch {}`** (silent failures)
- **7 duplicate routes** (exact copies)
- **9,617 lines** in OpportunityEngineMasterView (over-renders)

### Database
- **3.4 GB** portfolio.db size
- **1 callback SQLite connection** (serializes all ops)
- **159 overlapping indexes** (14 exact duplicates)
- **34 per-row writes** without transaction
- **3.4 GB backup copies** after every write (B7)

### Performance Impact
- **B1 (critical):** Single DB connection serializes unrelated requests
- **B3 (critical):** Dashboard cold load = 10+ seconds (25 serial awaits)
- **B7 (critical):** 3.4 GB copy evicts OS cache, competes with reads
- **B4 (critical):** 159 indexes, query planner uses heuristics only

---

## ✅ Validation Checklist

Before applying any fix:
- [ ] Confirm DB size: `SELECT page_count * page_size / 1e9 FROM pragma_page_count, pragma_page_size`
- [ ] Run EXPLAIN QUERY PLAN on top 10 queries
- [ ] Profile dashboard load (before/after benchmark)
- [ ] Test backup consistency under concurrent writes
- [ ] Validate on portfolio.db copy (never prod)

---

## 🎯 Next Steps (In Priority Order)

1. **Review findings** with team (30 min)
2. **Prioritize security** (P1-3: CORS, auth, body limit) — 2 hours
3. **Apply quick wins** (B7 removal, duplicate routes, index cleanup) — 4 hours
4. **Schedule medium work** (batch writes, cache invalidation) — 1–2 weeks
5. **Plan long-term refactor** (better-sqlite3, split god files) — 1–2 months

---

**Generated:** 2026-10-07 | **Skills Used:** graphify, performance-optimization, ponytail, observability-and-instrumentation | **Next Review:** Before refactoring | **Maintainer:** Claude Code
