import re

with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

target1 = """  // Trigger initial background market price sync asynchronously only during active market hours (deferred to 120s)
  if (process.env.ENABLE_STARTUP_STRATEGIES === 'true') setTimeout(() => {
    if (isIndianMarketHours()) {
      autoFetchMarketData(getDB()).catch(console.error);
    }
  }, 120000);"""

repl1 = """  // Trigger initial background market price sync asynchronously only during active market hours (deferred to 120s)
  if (process.env.ENABLE_STARTUP_STRATEGIES === 'true') setTimeout(() => {
    if (isIndianMarketHours()) {
      if (process.env.READ_ONLY_RUNTIME !== 'true') {
        autoFetchMarketData(getDB()).catch(console.error);
      } else {
        console.log('[ReadOnlyRuntime] Skipping initial market-price sync.');
      }
    }
  }, 120000);"""

target2 = """      if (elapsedShares >= shareIntervalMs) {
        lastAutoFetchTimestamp = now;
        console.log(`[Market Scheduler] Triggering auto-refresh`);
        try {
          await autoFetchMarketData(db);
          await persistRefreshStamp(db, 'market-prices');
        } catch (err) {
          console.error('[Market Scheduler] Error:', err);
        }
      }"""

repl2 = """      if (elapsedShares >= shareIntervalMs) {
        lastAutoFetchTimestamp = now;
        console.log(`[Market Scheduler] Triggering auto-refresh`);
        try {
          if (process.env.READ_ONLY_RUNTIME !== 'true') {
            await autoFetchMarketData(db);
            await persistRefreshStamp(db, 'market-prices');
          } else {
            console.log(`[ReadOnlyRuntime] Skipping auto-refresh`);
          }
        } catch (err) {
          console.error('[Market Scheduler] Error:', err);
        }
      }"""

text = text.replace(target1, repl1)
text = text.replace(target2, repl2)

with open('temp_server.ts', 'w', encoding='utf-8') as f:
    f.write(text)
