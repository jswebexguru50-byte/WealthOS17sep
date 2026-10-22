# ITAS Phase 2: Quick Reference Guide

## 3-Panel Layout

```
┌─────────────────────────────────────────────────────────────┐
│                         App Header                          │
├────────────┬────────────────────────────────────────────────┤
│  LEFT      │              RIGHT PANEL                       │
│  PANEL     │  ┌──────────────────────────────────────────┐  │
│ (320px)    │  │ Header: Logo + Title + Export            │  │
│ Collapse   │  ├──────────────────────────────────────────┤  │
│ toggle ▼   │  │ Tabs: [Matrix] [Convergence] [Progress]  │  │
│            │  ├──────────────────────────────────────────┤  │
│ Strategy   │  │ Search Bar                               │  │
│ Preset     │  ├──────────────────────────────────────────┤  │
│ [▼]        │  │ Content Area (dynamic per tab)           │  │
│            │  │ - Matrix: Table with S1-S10 columns      │  │
│ Strategies │  │ - Convergence: Multi-strategy matches    │  │
│ ☑ S1: VPA  │  │ - Progress: Real-time scan bars          │  │
│ ☑ S2: FVG  │  └──────────────────────────────────────────┘  │
│ ☑ S3: HH   │                                               │
│ ☑ S4: SMA  │                                               │
│ ☐ S5: EMA  │                                               │
│ ... (10)   │                                               │
│            │                                               │
│ [▶ Run 4]  │                                               │
│ [▶ Run 10] │                                               │
│            │                                               │
│ Universe   │                                               │
│ 3,847      │                                               │
│            │                                               │
│ ☑ 52W Low  │                                               │
└────────────┴────────────────────────────────────────────────┘
```

## User Workflows

### Workflow 1: Quick Scan (4-Strategy Focus)
1. Left panel defaults to S1-S4 selected
2. Click [▶ Run Selected (4)]
3. Scan begins, Progress tab shows real-time updates
4. Results auto-switch to Matrix tab
5. Review qualified stocks, click [Export CSV]

### Workflow 2: Deep Analysis (All 10 Strategies)
1. In left panel, click [▶ Run All (10)]
2. All strategies selected automatically
3. Scan completes
4. View Matrix tab for full comparison
5. Check Convergence tab for highest-conviction setups
6. Export both Matrix and Convergence CSVs

### Workflow 3: Filter Specific Strategies
1. Uncheck S5-S10 (momentum strategies)
2. Keep only S1-S4 (VPA strategies) checked
3. Select "4-Strategy (S1-S4)" preset
4. Click [▶ Run Selected (4)]
5. Results show only VPA-based setups

### Workflow 4: 52-Week Low Filter
1. Check "52-Week Low Origin" toggle
2. Select strategies
3. Click [▶ Run Selected]
4. Only stocks with P0 at 52W low qualify

## Tab Behaviors

### MATRIX Tab (Default)
- **Content:** Side-by-side comparison of all strategies
- **Columns:** Symbol, CMP, S1✓, S2✓, S3✓, S4✓, Convergence, Best R:R
- **Sorting:** Click column headers to sort
- **Filtering:** Use search bar (searches symbol + company name)
- **Export:** Downloads full matrix with all rows

### CONVERGENCE Tab
- **Content:** Only stocks in 2+ strategies
- **Metric:** Shows how many strategies qualified
- **Use Case:** Highest-conviction setups (multi-strategy validation)
- **Export:** CSV with symbol, company, convergence count, matched strategies

### PROGRESS Tab (During Scan)
- **Visible:** Only when scan is active (loading = true)
- **Per-Strategy Bars:** Shows progress for each selected strategy
- **Format:** "Strategy Name: 45/3847 symbols"
- **Use:** Monitor long scans without blocking UI

### INDIVIDUAL Tab (Future)
- **Will Show:** Qualified stocks per strategy
- **Will Include:** Full rule-by-rule breakdown
- **Will Export:** Per-strategy CSV with metrics
- **TBD:** Card-based or expanded table view

## Key State Variables

```typescript
// Left Panel
leftPanelOpen: boolean           // Collapse toggle
selectedStrategies: Set<string>  // Checked strategy IDs
universeCount: number            // Total stocks to scan
strategyLibrary: StrategyLibraryItem[]  // Available strategies

// Right Panel
activeTab: 'MATRIX' | 'CONVERGENCE' | 'PROGRESS' | 'INDIVIDUAL'
tableSearch: string              // Search filter text
sortColumn: string               // Current sort column
sortDirection: 'asc' | 'desc'    // Sort direction

// Scan
loading: boolean                 // Scan in progress
scanProgress: ScanProgressItem[]  // Per-strategy progress
report: IndependentTechnicalScanReport  // Results
```

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/strategies/library` | GET | Load available strategies |
| `/api/technical-strategies/universe-count` | GET | Total stocks in universe |
| `/api/technical-strategies/scan-multi` | POST | Execute multi-strategy scan |
| `/api/technical-strategies/scan-progress` | GET | Poll scan progress |

## Styling Classes

### Accents by Strategy
- S1 (VPA): `text-emerald-400` / `bg-emerald-500/20`
- S2 (FVG): `text-cyan-400` / `bg-cyan-500/20`
- S3 (HH): `text-amber-400` / `bg-amber-500/20`
- S4 (SMA): `text-pink-400` / `bg-pink-500/20`
- Convergence: `text-purple-400` / `bg-purple-500/20`

### Component Sizes
- Left panel: 320px (open) / 56px (collapsed)
- Right panel: flex-1 (fills remaining space)
- Header: 80px height
- Tab bar: 48px height
- Content: Scrollable, flex-1

## Common Tasks

### Add a New Strategy to Library
- Backend: Add to `/api/strategies/library` response
- Frontend: No code change needed, auto-loads from library

### Change Default Selected Strategies
```typescript
// In useEffect, line ~290:
const builtInIds = libJson.data.filter((s: any) => s.isBuiltIn).map((s: any) => s.id);
setSelectedStrategies(new Set(builtInIds.slice(0, 4))); // Change slice(0, 4) to desired count
```

### Add Column to Comparison Matrix
1. Add to table header (line ~780)
2. Add to table body (line ~795)
3. Add to CSV export (line ~705)

### Modify Export Filename
```typescript
downloadCsv('your_custom_name', headers, rows);
// Result: your_custom_name_YYYYMMDD.csv
```

### Change Tab Colors
```typescript
// Example: Make Matrix tab blue instead of indigo
activeTab === 'MATRIX'
  ? 'bg-blue-600 text-white'  // Change from indigo-600
  : 'bg-slate-800 text-slate-300 hover:text-white'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Checkboxes not working | Check `toggleStrategy()` function, verify Set operations |
| Search not filtering | Check search logic in `useMemo`, case sensitivity |
| Export CSV empty | Verify `filteredComparisonRows.length > 0` before export |
| Progress bar stuck | Check polling interval, verify `/scan-progress` endpoint |
| Tab content blank | Check `report` state initialization and tab condition |
| Styles not applying | Verify Tailwind classes in `tailwind.config.js` |

## Performance Tips

1. **Large Matrix:** Use search to filter before export (10K+ rows slow)
2. **Collapse Left Panel:** Frees ~320px for content when not needed
3. **Monitor Progress Tab:** Watch individual strategy times to optimize
4. **Cache Results:** Consider storing report in sessionStorage for re-export
5. **Lazy Load:** Future: Implement virtual scrolling for 10K+ row tables

## Feature Requests for Future Phases

- [ ] Save custom presets (save button in left panel)
- [ ] Clone preset (clone button in left panel)
- [ ] Parameter groups (9 families, Phase 2b)
- [ ] Per-strategy detailed view (Phase 3)
- [ ] Convergence radar chart (Phase 5)
- [ ] WebSocket streaming (Phase 4)
- [ ] Intraday signal alerts (Phase 6)
