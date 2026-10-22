# ITAS Phase 2 - Code Snippets & Customization Guide

## Common Customizations

### 1. Change Default Selected Strategies

**Current (S1-S4):**
```typescript
// Line ~300
const builtInIds = libJson.data.filter((s: any) => s.isBuiltIn).map((s: any) => s.id);
setSelectedStrategies(new Set(builtInIds.slice(0, 4))); // Selects first 4
```

**To Select All 10:**
```typescript
setSelectedStrategies(new Set(builtInIds)); // All strategies
```

**To Select Specific Strategies:**
```typescript
setSelectedStrategies(new Set(['STRATEGY_1', 'STRATEGY_3', 'STRATEGY_5'])); // S1, S3, S5 only
```

### 2. Change Polling Interval

**Current (1500ms):**
```typescript
// Line ~320
const iv = setInterval(async () => {
  // Poll code
}, 1500); // Milliseconds
```

**To Poll Every 500ms (Faster):**
```typescript
}, 500); // Faster updates, more API calls
```

**To Poll Every 3000ms (Slower):**
```typescript
}, 3000); // Fewer API calls, less responsive
```

### 3. Modify Table Columns

**Current Comparison Matrix Columns:**
```typescript
// Line ~780
<th>Symbol</th>
<th>CMP (₹)</th>
<th>S1</th>
<th>S2</th>
// ... etc
```

**To Add Column (e.g., Company Name):**
```typescript
<th>
  <button onClick={() => handleSort('companyName')} className="...">
    Company {sortColumn === 'companyName' && (sortDirection === 'asc' ? '▲' : '▼')}
  </button>
</th>
```

**Update table body:**
```typescript
<td className="py-2 px-3 text-slate-300">{row.companyName}</td>
```

### 4. Change Tab Colors

**Current Tab Style (Indigo for MATRIX):**
```typescript
// Line ~715
activeTab === 'MATRIX'
  ? 'bg-indigo-600 text-white'
  : 'bg-slate-800 text-slate-300 hover:text-white'
```

**To Make Tabs Blue:**
```typescript
activeTab === 'MATRIX'
  ? 'bg-blue-600 text-white'
  : 'bg-slate-800 text-slate-300 hover:text-white'
```

**To Make Tabs Green:**
```typescript
activeTab === 'MATRIX'
  ? 'bg-emerald-600 text-white'
  : 'bg-slate-800 text-slate-300 hover:text-white'
```

### 5. Adjust Left Panel Width

**Current (320px open, 56px closed):**
```typescript
// Line ~645
className={`transition-all duration-300 overflow-hidden flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-lg ${
  leftPanelOpen ? 'w-80' : 'w-14'  // 320px : 56px
}`}
```

**To Make Wider (400px):**
```typescript
leftPanelOpen ? 'w-screen md:w-[400px]' : 'w-14'
```

**To Make Narrower (280px):**
```typescript
leftPanelOpen ? 'w-72' : 'w-14'
```

### 6. Change CSV Export Filename

**Current Filename Format:**
```typescript
// Line ~705
downloadCsv('itas_comparison_matrix', headers, rows);
// Generates: itas_comparison_matrix_20260910.csv
```

**Custom Filename with Date:**
```typescript
const timestamp = new Date().toISOString().split('T')[0];
downloadCsv(`technical_analysis_${timestamp}`, headers, rows);
// Generates: technical_analysis_2026-09-10.csv
```

**Filename with User/Portfolio:**
```typescript
const portfolioName = 'my_portfolio';
downloadCsv(`itas_${portfolioName}_matrix`, headers, rows);
// Generates: itas_my_portfolio_matrix_20260910.csv
```

### 7. Add Column to CSV Export

**Current Headers:**
```typescript
// Line ~705
const headers = [
  'Symbol', 'Company Name', 'CMP (INR)', 'Convergence Count', 'Best Risk Reward Ratio',
  'Strategy 1: VPA Compaction', 'Strategy 2: FVG Pullback', ...
];
```

**To Add Column (e.g., "52W High"):**
```typescript
const headers = [
  'Symbol', 'Company Name', 'CMP (INR)', '52W High', 'Convergence Count', // Add after CMP
  'Best Risk Reward Ratio',
  // ... rest unchanged
];

// Update rows mapping:
const rows = filteredComparisonRows.map(r => [
  r.symbol,
  r.companyName,
  r.cmp,
  r.s1?.preceding52WeekLow || '--', // Add new data column
  `${r.convergenceCount}/10`,
  r.bestRiskReward ? `${r.bestRiskReward}x` : '--',
  // ... rest unchanged
]);
```

### 8. Add New Filter

**Current 52-Week Filter:**
```typescript
// Line ~840
<label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-800 transition">
  <input
    type="checkbox"
    checked={filterPreceding52wLow}
    onChange={e => setFilterPreceding52wLow(e.target.checked)}
    className="w-3 h-3 rounded cursor-pointer accent-amber-500"
  />
  <span className="text-xs text-slate-300 font-medium">52-Week Low Origin</span>
</label>
```

**To Add "Min R:R Filter":**
```typescript
// Add to state (line ~220)
const [minRiskRewardRatio, setMinRiskRewardRatio] = useState<number>(1.5);

// Add to left panel (after 52W filter)
<div className="space-y-2 pt-2 border-t border-slate-800">
  <label className="text-xs font-bold text-slate-300 uppercase">Min Risk Reward Ratio</label>
  <input
    type="range"
    min="1"
    max="5"
    step="0.5"
    value={minRiskRewardRatio}
    onChange={e => setMinRiskRewardRatio(parseFloat(e.target.value))}
    className="w-full"
  />
  <span className="text-xs text-indigo-400">{minRiskRewardRatio.toFixed(1)}x</span>
</div>

// Add to filter logic
const filteredByRR = filteredComparisonRows.filter(r => r.bestRiskReward >= minRiskRewardRatio);
```

### 9. Add Download Button to Each Tab

**Current (Only Matrix tab has export):**
```typescript
// Line ~725
{activeTab === 'MATRIX' && (
  <button onClick={handleExportMatrixCsv} ...>
    Export CSV
  </button>
)}
```

**To Add Per-Tab Exports:**
```typescript
// Add handler for each strategy
const handleExportStrategy1Csv = () => {
  if (!report?.strategy1Matches) return;
  const headers = ['Symbol', 'Company', 'CMP', 'Impulse %', 'R:R'];
  const rows = report.strategy1Matches.map(m => [
    m.symbol, m.companyName, m.cmp, `+${m.impulseGainPct}%`, `${m.riskRewardRatio}x`
  ]);
  downloadCsv('strategy_1_results', headers, rows);
};

// Add button for each strategy tab (future INDIVIDUAL tab)
{activeTab === 'INDIVIDUAL' && (
  <button onClick={handleExportStrategy1Csv} ...>
    Export S1 CSV
  </button>
)}
```

### 10. Customize Search

**Current Search (Symbol + Company Name):**
```typescript
// Line ~380
const filteredBySearch = list.filter(r =>
  r.symbol.toLowerCase().includes(q) ||
  r.companyName.toLowerCase().includes(q)
);
```

**To Include Convergence in Search:**
```typescript
const filteredBySearch = list.filter(r =>
  r.symbol.toLowerCase().includes(q) ||
  r.companyName.toLowerCase().includes(q) ||
  r.convergenceCount.toString().includes(q) // Search by convergence count
);
```

**To Search Smart Money Alert:**
```typescript
const filteredBySearch = list.filter(r =>
  r.symbol.toLowerCase().includes(q) ||
  r.companyName.toLowerCase().includes(q) ||
  (r.smartMoneyAlert && r.smartMoneyAlert.toLowerCase().includes(q))
);
```

---

## Advanced Customizations

### 1. Add Real-Time Updates (WebSocket)

**Replace polling with WebSocket:**
```typescript
// Remove old polling useEffect (line ~320)
// useEffect(() => {
//   if (!loading || scanProgress.length === 0) return;
//   const iv = setInterval(async () => {
//     // Old polling code
//   }, 1500);
//   return () => clearInterval(iv);
// }, [loading]);

// Add WebSocket effect
useEffect(() => {
  if (!loading) return;
  
  const ws = new WebSocket('ws://localhost:3000/api/technical-strategies/scan-progress');
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (Array.isArray(data)) {
      setScanProgress(data);
    }
  };
  
  ws.onerror = (error) => console.error('WebSocket error:', error);
  
  return () => ws.close();
}, [loading]);
```

### 2. Add Keyboard Shortcuts

**Add to component:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'r' && e.ctrlKey) {
      handleRunSelected(); // Ctrl+R to run
    }
    if (e.key === 'e' && e.ctrlKey) {
      handleExportMatrixCsv(); // Ctrl+E to export
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 3. Add Dark/Light Theme Toggle

**Add to state:**
```typescript
const [darkMode, setDarkMode] = useState<boolean>(true);
```

**In JSX (add button in header):**
```typescript
<button
  onClick={() => setDarkMode(!darkMode)}
  className={darkMode ? 'bg-yellow-500' : 'bg-slate-800'}
>
  {darkMode ? '☀️' : '🌙'}
</button>
```

**Apply theme to main div:**
```typescript
<div className={`flex gap-4 h-screen text-slate-100 font-sans ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>
```

### 4. Add Pagination to Results

**Add to state:**
```typescript
const [pageSize, setPageSize] = useState<number>(50);
const [currentPage, setCurrentPage] = useState<number>(1);
```

**Calculate paginated rows:**
```typescript
const paginatedRows = useMemo(() => {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return filteredComparisonRows.slice(start, end);
}, [filteredComparisonRows, pageSize, currentPage]);

const totalPages = Math.ceil(filteredComparisonRows.length / pageSize);
```

**Add pagination controls:**
```typescript
<div className="p-3 border-t border-slate-800 flex items-center justify-between">
  <select value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value))}>
    <option value={10}>10 per page</option>
    <option value={50}>50 per page</option>
    <option value={100}>100 per page</option>
  </select>
  
  <div className="flex items-center gap-2">
    <button
      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
      disabled={currentPage === 1}
    >
      Previous
    </button>
    <span>{currentPage} / {totalPages}</span>
    <button
      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
      disabled={currentPage === totalPages}
    >
      Next
    </button>
  </div>
</div>
```

### 5. Add Convergence Threshold Filter

**Add to state:**
```typescript
const [minConvergence, setMinConvergence] = useState<number>(2);
```

**Add to left panel:**
```typescript
<div className="space-y-2">
  <label className="text-xs font-bold text-slate-300">Min Convergence</label>
  <input
    type="range"
    min="1"
    max="10"
    value={minConvergence}
    onChange={e => setMinConvergence(parseInt(e.target.value))}
  />
  <span className="text-[10px] text-indigo-400">{minConvergence}+ strategies</span>
</div>
```

**Apply filter:**
```typescript
const filtered = filteredComparisonRows.filter(r => r.convergenceCount >= minConvergence);
```

---

## Debugging Tips

### 1. Log Strategy Selection Changes
```typescript
// In toggleStrategy function, add:
console.log('Strategy toggled:', id, 'New selection:', Array.from(selectedStrategies));
```

### 2. Monitor API Response Times
```typescript
const handleRunSelected = async () => {
  const start = performance.now();
  // ... API call code ...
  const end = performance.now();
  console.log(`Scan completed in ${(end - start) / 1000}s`);
};
```

### 3. Verify State Updates
```typescript
// Add after setState
useEffect(() => {
  console.log('activeTab changed to:', activeTab);
}, [activeTab]);

useEffect(() => {
  console.log('Report updated:', report?.totalUniverseScanned, 'stocks scanned');
}, [report]);
```

### 4. Check Search Filter
```typescript
// Add in filtered rows useMemo
console.log('Search term:', tableSearch);
console.log('Filtered rows:', list.length, 'from', masterComparisonRows.length);
```

---

## Performance Optimization Snippets

### 1. Memoize Expensive Calculations
```typescript
const expensiveComputation = useMemo(() => {
  console.log('Recalculating...');
  return filteredComparisonRows.reduce((acc, row) => {
    return acc + row.convergenceCount;
  }, 0);
}, [filteredComparisonRows]);
```

### 2. Debounce Search Input
```typescript
import { useEffect, useRef } from 'react';

const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const handleSearch = debounce((value: string) => {
  setTableSearch(value);
}, 300); // Wait 300ms after typing stops
```

### 3. Limit Results for Performance
```typescript
// Show only first 1000 rows if data is large
const displayRows = useMemo(() => {
  return filteredComparisonRows.slice(0, 1000);
}, [filteredComparisonRows]);
```

---

## Common Fixes

### Tab Content Not Appearing
**Check:** Ensure `activeTab` matches tab constant name
```typescript
// Wrong:
activeTab === 'matrix' // Should be uppercase 'MATRIX'

// Right:
activeTab === 'MATRIX'
```

### Search Not Working
**Check:** Search is case-sensitive by default
```typescript
// Add .toLowerCase() to both sides:
const q = tableSearch.toLowerCase();
list.filter(r => r.symbol.toLowerCase().includes(q))
```

### Export Button Disabled
**Check:** Ensure data exists before export
```typescript
// Before calling export:
if (!filteredComparisonRows.length) return;
// Then proceed with export
```

### Progress Bar Not Updating
**Check:** Polling endpoint is being called
```typescript
// Add debug logging:
console.log('Polling progress...');
const r = await fetch('/api/technical-strategies/scan-progress');
console.log('Progress response:', r.ok);
```

---

**These snippets should handle 90% of customization needs. For more complex changes, refer to the main component and documentation files.**
