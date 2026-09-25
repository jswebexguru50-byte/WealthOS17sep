
import sys

path = 'src/server/yahooFinance.ts'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Instead of matching the whole string, let's just find the index of 'INSERT INTO ValuationSnapshots (timestamp'
start_idx = c.find('INSERT INTO ValuationSnapshots (timestamp')
if start_idx != -1:
    # find the preceding await dbRun(db, 
    await_idx = c.rfind('await dbRun(db, ', 0, start_idx)
    if await_idx != -1:
        end_idx = c.find(']);', start_idx)
        if end_idx != -1:
            full_target = c[await_idx:end_idx+3]
            replacement = '''const { recordValuationSnapshot } = await import('./database.js');
        await recordValuationSnapshot(db, {
          portfolio: pv.portfolio,
          total_value_inr: pv.total_value,
          equity_value: pv.equity_value,
          cash_value: pv.cash_value,
          mf_value: pv.mf_value,
          aif_value: pv.aif_value,
          unlisted_value: pv.unlisted_value,
          fx_rate_usd: snapUsdRate,
          trigger_source: 'MARKET_SYNC',
          drift_pct: driftPct,
          drift_alert: driftAlert,
          observationTimestamp: sourceObservationTimestamp || undefined,
        });'''
            c = c[:await_idx] + replacement + c[end_idx+3:]
            with open(path, 'w', encoding='utf-8') as f:
                f.write(c)

