# Phase 2 ITAS Refactor - Integration Checklist

## Pre-Deployment

### Code Review
- [ ] Review `src/components/IndependentTechnicalStrategiesView.tsx` for code quality
- [ ] Verify TypeScript compilation: `npm run lint` (should show 0 errors)
- [ ] Check for any console.error/warnings in new code
- [ ] Validate that all exports match expected interface

### API Verification
Ensure backend endpoints are available:

```bash
# Test endpoints exist
curl -X GET http://localhost:3000/api/strategies/library
curl -X GET http://localhost:3000/api/technical-strategies/universe-count
curl -X POST http://localhost:3000/api/technical-strategies/scan-multi \
  -H "Content-Type: application/json" \
  -d '{"strategyIds": "STRATEGY_1,STRATEGY_2"}'
curl -X GET http://localhost:3000/api/technical-strategies/scan-progress
```

### Required API Responses

**GET /api/strategies/library:**
```json
{
  "success": true,
  "data": [
    { "id": "STRATEGY_1", "name": "S1: VPA Compaction", "isBuiltIn": true },
    { "id": "STRATEGY_2", "name": "S2: FVG / CE Pullback", "isBuiltIn": true },
    // ... up to 10 strategies
  ]
}
```

**GET /api/technical-strategies/universe-count:**
```json
{
  "success": true,
  "data": 3847
}
```

**POST /api/technical-strategies/scan-multi:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-09-10T12:00:00Z",
    "totalUniverseScanned": 3847,
    "strategy1Matches": [...],
    "strategy2Matches": [...],
    // ... all 10 strategy results
    "multiConvergenceMatches": [...]
  }
}
```

**GET /api/technical-strategies/scan-progress:**
```json
{
  "success": true,
  "data": [
    {
      "strategyId": "STRATEGY_1",
      "strategyName": "S1: VPA Compaction",
      "status": "running",
      "qualified": 45,
      "total": 3847
    },
    {
      "strategyId": "STRATEGY_2",
      "strategyName": "S2: FVG / CE Pullback",
      "status": "pending",
      "qualified": 0,
      "total": 3847
    }
  ]
}
```

## Deployment Steps

### 1. Build
```bash
cd /path/to/webapp_portable_release
npm run build
```
**Expected:** No errors, ~5-10 minutes

### 2. Local Testing
```bash
npm start
# Navigate to ITAS component
# http://localhost:3000/itas (or wherever routed)
```

**Test Checklist:**
- [ ] Page loads without console errors
- [ ] Left panel displays with collapse toggle
- [ ] Strategy library loads in checkboxes
- [ ] Universe count displays (e.g., "3,847")
- [ ] Can select/deselect strategies
- [ ] Selected count updates: "N/10"
- [ ] Run buttons not disabled when strategies selected
- [ ] Run buttons disabled when no strategies selected

### 3. Functional Testing

#### Test 1: Run Selected Strategies
```
1. Keep default selection (S1-S4)
2. Click [▶ Run Selected (4)]
3. Active Tab switches to PROGRESS
4. Progress bars appear for S1, S2, S3, S4
5. After ~30-60 seconds, tab switches to MATRIX
6. Results display in table
```

**Expected Result:** ✅ Pass if matrix shows qualified stocks

#### Test 2: Search & Filter
```
1. In MATRIX tab, type "TCS" in search box
2. Table filters to show only TCS and related companies
3. Click convergence header to sort
4. Highest convergence at top
```

**Expected Result:** ✅ Pass if search filters and sort works

#### Test 3: Export CSV
```
1. In MATRIX tab, click [Export CSV]
2. Downloads file: itas_comparison_matrix_YYYYMMDD.csv
3. Open in Excel/Sheets
4. Columns: Symbol, Company, CMP, Convergence, Best R:R, S1-S10
5. Data matches on-screen table
```

**Expected Result:** ✅ Pass if CSV downloads and has correct data

#### Test 4: Convergence Tab
```
1. Navigate to CONVERGENCE tab
2. View stocks in 2+ strategies
3. Click [Export CSV]
4. Download: itas_convergence_setups_YYYYMMDD.csv
5. Verify only multi-strategy matches included
```

**Expected Result:** ✅ Pass if convergence data correct

#### Test 5: 52-Week Filter
```
1. Check "52-Week Low Origin" toggle in left panel
2. Click [▶ Run Selected]
3. Results should show only P0 at 52W low
4. Convergence count may be lower (more stringent filter)
```

**Expected Result:** ✅ Pass if filter reduces results

#### Test 6: Collapse Left Panel
```
1. Click collapse button (▼ icon in left panel header)
2. Panel shrinks to 56px width
3. Content area expands to fill space
4. Click again to expand
5. Panel returns to 320px
```

**Expected Result:** ✅ Pass if collapse/expand smooth and no layout break

### 4. Browser Compatibility
Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile (iPhone/Android) - responsive?

### 5. Performance Testing

#### Large Scan (All Strategies)
```bash
1. Select all 10 strategies
2. Click [▶ Run All (10)]
3. Monitor Progress tab
4. Observe: No UI freeze, progress updates every 1-2 seconds
5. Complete scan should take <2 minutes for 3800+ stocks
```

**Expected Result:** ✅ Pass if no UI freeze, scan completes in reasonable time

#### Large Export
```bash
1. After scan, in MATRIX tab with ~500-1000 qualified stocks
2. Click [Export CSV]
3. File should download within 5 seconds
4. CSV should be <5MB
```

**Expected Result:** ✅ Pass if export fast and reasonable file size

### 6. Error Handling
Test error cases:

#### Missing Universe Count
- [ ] Page loads, but universe displays as 0
- [ ] User can still select strategies
- [ ] Run buttons enabled (don't depend on count)

#### Failed Scan
- [ ] Error message displays in red banner
- [ ] User can retry without page refresh
- [ ] No console errors

#### Network Timeout
- [ ] User clicks Run, nothing happens for 30s
- [ ] Timeout error displays
- [ ] User can click Run again

---

## Staging Deployment

### Pre-Staging
1. [ ] All local tests pass
2. [ ] No console errors
3. [ ] TypeScript compilation clean
4. [ ] Code review approved
5. [ ] API endpoints verified

### Staging Deployment
```bash
# On staging server
cd /opt/webapp_portable_release
git pull origin main
npm install
npm run build
npm start

# Verify
curl http://staging.example.com/api/strategies/library
# Should return 200 with strategy list
```

### Staging Smoke Tests
- [ ] ITAS page loads
- [ ] Can run all 4 strategies (S1-S4)
- [ ] Can run all 10 strategies
- [ ] CSV export works
- [ ] No 404 errors in browser console
- [ ] No database errors in server logs

### Staging Performance
- [ ] Scan with 10 strategies: <2 minutes
- [ ] Export CSV: <5 seconds
- [ ] Search filter: <500ms response
- [ ] Page load: <3 seconds

---

## Production Deployment

### Pre-Production Checklist
- [ ] Staging tests all pass
- [ ] No known issues
- [ ] Team sign-off obtained
- [ ] Rollback plan documented
- [ ] On-call engineer identified

### Production Deployment Steps

```bash
# 1. Backup current version
cp -r /opt/webapp_portable_release /opt/webapp_portable_release.backup.20260910

# 2. Pull and build
cd /opt/webapp_portable_release
git pull origin main
npm install
npm run build

# 3. Verify build succeeded
ls -la dist/
# Should see: index.html, server.cjs, and assets

# 4. Restart application
sudo systemctl restart webapp_portable_release

# 5. Verify health check
curl http://localhost:3000/api/health
# Should return 200

# 6. Verify ITAS endpoint
curl http://localhost:3000/api/strategies/library
# Should return strategy list

# 7. Monitor logs for errors
tail -f /var/log/webapp_portable_release/app.log
```

### Post-Deployment Monitoring

**First Hour:**
- [ ] Monitor server logs for errors
- [ ] Check CPU/memory usage (should be normal)
- [ ] Test ITAS page loads in browser
- [ ] Run quick scan (S1-S4) to verify API calls work

**First Day:**
- [ ] Monitor error rate (should be <0.1%)
- [ ] Check performance metrics (scan time, export time)
- [ ] Verify no database issues
- [ ] Get user feedback if available

**First Week:**
- [ ] Monitor for any issues reported by users
- [ ] Check performance trends
- [ ] Verify no memory leaks (monitor memory over time)
- [ ] Plan Phase 3 implementation

### Rollback Plan

If critical issues found:

```bash
# 1. Stop current version
sudo systemctl stop webapp_portable_release

# 2. Restore backup
rm -rf /opt/webapp_portable_release
cp -r /opt/webapp_portable_release.backup.20260910 /opt/webapp_portable_release

# 3. Restart with old version
sudo systemctl start webapp_portable_release

# 4. Verify restored
curl http://localhost:3000/api/strategies/library

# 5. Notify team
echo "Rolled back to previous version. Phase 2 refactor paused."
```

---

## Post-Deployment

### Documentation Updates
- [ ] Update README if ITAS UI changed
- [ ] Update user guides with new 3-panel layout
- [ ] Document new keyboard shortcuts (if any)
- [ ] Update API documentation

### Team Communication
- [ ] Send deployment notification
- [ ] Brief team on new UI layout
- [ ] Point to QUICK_REFERENCE.md for developers
- [ ] Schedule Phase 3 planning meeting

### Metrics Collection
- [ ] Set up monitoring for ITAS performance
- [ ] Track scan time trend over time
- [ ] Monitor error rate
- [ ] Collect user feedback

### Phase 3 Planning
- [ ] Review Phase 3 requirements (INDIVIDUAL tab)
- [ ] Prioritize parameter groups (9 families)
- [ ] Schedule development sprint
- [ ] Assign developer(s)

---

## Quick Reference: Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "No strategies loaded" | /api/strategies/library fails | Check backend endpoint, verify network |
| "Run button disabled" | selectedStrategies.size === 0 | Select at least 1 strategy |
| "Export button disabled" | No data in current tab | Run a scan first |
| "Progress bar stuck" | Polling not working | Check /api/technical-strategies/scan-progress |
| "Matrix empty" | Report is null | Check scan response in Network tab |
| "Search not working" | Filter logic broken | Verify tableSearch state updates |
| "UI freezes on export" | Large dataset | Consider pagination in Phase 3 |

---

## Success Criteria

**Phase 2 is successful when:**

- ✅ All 5 functional tests pass (Selected, Filter, Export, Convergence, 52W)
- ✅ TypeScript compilation clean (0 errors)
- ✅ No console errors in browser
- ✅ API endpoints respond correctly
- ✅ CSV exports have correct data
- ✅ Scan completes in <2 minutes for 10 strategies
- ✅ Export CSV completes in <5 seconds
- ✅ Team sign-off obtained
- ✅ Documentation complete
- ✅ Deployed to staging without issues

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | [Claude Code] | 2026-09-10 | ✅ Complete |
| Code Review | [To assign] | — | ⏳ Pending |
| QA/Testing | [To assign] | — | ⏳ Pending |
| Product | [To assign] | — | ⏳ Pending |
| Deployment | [To assign] | — | ⏳ Pending |

---

**Component Status:** Ready for Code Review

**Next Step:** Assign code reviewer and schedule QA testing
