const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../../server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('Original server.ts size:', content.length);

function safeReplace(source, target, replacement, label) {
  const targetCRLF = target.replace(/\r?\n/g, '\r\n');
  const replCRLF = replacement.replace(/\r?\n/g, '\r\n');
  if (source.includes(targetCRLF)) {
    console.log(`[OK] Replaced ${label} (CRLF)`);
    return source.replace(targetCRLF, replCRLF);
  }
  const targetLF = target.replace(/\r?\n/g, '\n');
  const replLF = replacement.replace(/\r?\n/g, '\n');
  if (source.includes(targetLF)) {
    console.log(`[OK] Replaced ${label} (LF)`);
    return source.replace(targetLF, replLF);
  }
  console.warn(`[WARN] Target not found for ${label}`);
  return source;
}

// 1. P0-3 Security: BIND_HOST, CORS, Body Limit, TimingSafeEqual, and duplicate strategiesRouter mount
const targetSec = `const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';


// Security Headers & CORS Middleware (Helmet-equivalent hardening)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-password, x-requested-with, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ── HTTP Response Compression (gzip) — reduces payload size by 60-80% ────────
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// ─────────────────────────────────────────────────────────────────────────────

// Forensic Intelligence Layer Endpoints
app.use('/api/forensic', forensicRouter);
// Strategy Calibration, Signal Quality & Execution Endpoints
app.use('/api/strategies', strategiesRouter);
app.use('/api/auth/kite', kiteRouter);
// StockScans Clean-Room Parity Endpoints
app.use('/api/stockscans', stockscansRouter);
app.use('/api/remote', remoteBridgeRouter);
app.use('/api/ai-studio-proxy', (req, res, next) => { if (process.env.APP_PASSWORD && req.headers['x-app-password'] !== process.env.APP_PASSWORD) return res.status(401).json({ error: 'Unauthorized local session' }); next(); }, aiStudioProxyRouter);`;

const replSec = `const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
// Default to 127.0.0.1 for local security (Finding P0-3)
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';

// Allowed origins for CORS (default local dev ports)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(o => o.trim());

// Security Headers & CORS Middleware (Finding P0-3)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const origin = req.headers.origin as string;
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || 'http://localhost:3000');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-password, x-requested-with, Access-Control-Request-Private-Network');
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ── HTTP Response Compression (gzip) — reduces payload size by 60-80% ────────
app.use(compression());
// Global JSON payload body limit lowered to 2mb (Finding P0-3)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
// ─────────────────────────────────────────────────────────────────────────────

// Forensic Intelligence Layer Endpoints
app.use('/api/forensic', forensicRouter);
// Note: duplicate /api/strategies mount removed here; canonical mount is at line 344 (Finding P1-5)
app.use('/api/auth/kite', kiteRouter);
// StockScans Clean-Room Parity Endpoints
app.use('/api/stockscans', stockscansRouter);
app.use('/api/remote', remoteBridgeRouter);
app.use('/api/ai-studio-proxy', (req, res, next) => {
  if (process.env.APP_PASSWORD) {
    const provided = Buffer.from(String(req.headers['x-app-password'] || ''));
    const expected = Buffer.from(process.env.APP_PASSWORD);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Unauthorized local session' });
    }
  }
  next();
}, aiStudioProxyRouter);`;

content = safeReplace(content, targetSec, replSec, 'Security P0-3 & Route Mount P1-5');

// 2. B2 & P3-12: SWR Stale Preservation, ETag Header, and Disk Cache Stale Timestamp
const targetCacheBlock = `function invalidateDashboardCache(targetPortfolio?: string) {
  if (targetPortfolio) {
    const pNorm = targetPortfolio.toLowerCase().trim();
    for (const key of dashboardResponseCache.keys()) {
      if (key.toLowerCase().includes(pNorm) || key.includes('__all__')) {
        dashboardResponseCache.delete(key);
      }
    }
    for (const key of dashboardInFlight.keys()) {
      if (key.toLowerCase().includes(pNorm) || key.includes('__all__')) {
        dashboardInFlight.delete(key);
      }
    }
  } else {
    dashboardResponseCache.clear();
    dashboardInFlight.clear();
  }
  try {
    if (targetPortfolio) {
      dbRun(db, "DELETE FROM DashboardDiskCache WHERE cache_key LIKE ? OR cache_key LIKE '%__all__%'", [\`%\${targetPortfolio}%\`]).catch(() => {});
    } else {
      dbRun(db, "DELETE FROM DashboardDiskCache").catch(() => {});
    }
  } catch (e) {}
}`;

const replCacheBlock = `function invalidateDashboardCache(targetPortfolio?: string) {
  if (targetPortfolio) {
    const pNorm = targetPortfolio.toLowerCase().trim();
    for (const [key, entry] of dashboardResponseCache.entries()) {
      if (key.toLowerCase().includes(pNorm) || key.includes('__all__')) {
        // Preserve stale data for immediate SWR response while marking stale (Finding B2 & P3-12)
        entry.ts = 0;
      }
    }
    for (const key of dashboardInFlight.keys()) {
      if (key.toLowerCase().includes(pNorm) || key.includes('__all__')) {
        dashboardInFlight.delete(key);
      }
    }
  } else {
    for (const entry of dashboardResponseCache.values()) {
      entry.ts = 0;
    }
    dashboardInFlight.clear();
  }
  try {
    if (targetPortfolio) {
      dbRun(db, "DELETE FROM DashboardDiskCache WHERE cache_key LIKE ? OR cache_key LIKE '%__all__%'", [\`%\${targetPortfolio}%\`]).catch(() => {});
    } else {
      dbRun(db, "DELETE FROM DashboardDiskCache").catch(() => {});
    }
  } catch (e) {}
}`;

content = safeReplace(content, targetCacheBlock, replCacheBlock, 'SWR Stale Preservation (B2)');

// 3. ETag generation and 304 Not Modified support in /api/dashboard
const targetDashReturn = `    // Absolute first run ever or forced refresh — compute now with in-flight deduplication (P3-12)
    let inFlight = dashboardInFlight.get(dashCacheKey);
    if (!inFlight) {
      inFlight = buildDashboardPayload(selected, includeSold, dashCacheKey, memberIdRaw)
        .finally(() => {
          dashboardInFlight.delete(dashCacheKey);
        });
      dashboardInFlight.set(dashCacheKey, inFlight);
    }
    const payload = await inFlight;
    res.json(payload);`;

const replDashReturn = `    // Absolute first run ever or forced refresh — compute now with in-flight deduplication (P3-12)
    let inFlight = dashboardInFlight.get(dashCacheKey);
    if (!inFlight) {
      inFlight = buildDashboardPayload(selected, includeSold, dashCacheKey, memberIdRaw)
        .finally(() => {
          dashboardInFlight.delete(dashCacheKey);
        });
      dashboardInFlight.set(dashCacheKey, inFlight);
    }
    const payload = await inFlight;

    // ETag header for HTTP 304 zero-payload caching (Finding P3-12)
    const etag = \`W/"\${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')}"\`;
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      return res.sendStatus(304);
    }
    res.json(payload);`;

content = safeReplace(content, targetDashReturn, replDashReturn, 'ETag and 304 header (P3-12)');

// 4. Batch transaction for migrateMfPortfolios
const targetMfMigrate = `      for (const oldPortfolio of portfoliosToMigrate) {
        const newPortfolio = oldPortfolio.replace(/-MF$/i, '').trim().toUpperCase();
        if (oldPortfolio === newPortfolio) continue;

        console.log(\`[MIGRATION] Merging and migrating portfolio from "\${oldPortfolio}" to "\${newPortfolio}"...\`);

        // Update Transactions
        await dbRun(database, "UPDATE Transactions SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);
        
        // Update CamsConfigurations
        await dbRun(database, "UPDATE CamsConfigurations SET portfolio_name = ? WHERE portfolio_name = ?", [newPortfolio, oldPortfolio]);
        
        // Update ZerodhaHoldings
        await dbRun(database, "UPDATE ZerodhaHoldings SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);
        
        // Update BackupManualTransactions
        await dbRun(database, "UPDATE BackupManualTransactions SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);

        // Delete old holdings to let runFIFO fully recreate them cleanly
        await dbRun(database, "DELETE FROM Holdings WHERE portfolio = ? OR portfolio = ?", [oldPortfolio, newPortfolio]);
      }`;

const replMfMigrate = `      await dbRun(database, 'BEGIN IMMEDIATE');
      try {
        for (const oldPortfolio of portfoliosToMigrate) {
          const newPortfolio = oldPortfolio.replace(/-MF$/i, '').trim().toUpperCase();
          if (oldPortfolio === newPortfolio) continue;

          console.log(\`[MIGRATION] Merging and migrating portfolio from "\${oldPortfolio}" to "\${newPortfolio}"...\`);

          // Update Transactions
          await dbRun(database, "UPDATE Transactions SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);
          
          // Update CamsConfigurations
          await dbRun(database, "UPDATE CamsConfigurations SET portfolio_name = ? WHERE portfolio_name = ?", [newPortfolio, oldPortfolio]);
          
          // Update ZerodhaHoldings
          await dbRun(database, "UPDATE ZerodhaHoldings SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);
          
          // Update BackupManualTransactions
          await dbRun(database, "UPDATE BackupManualTransactions SET portfolio = ? WHERE portfolio = ?", [newPortfolio, oldPortfolio]);

          // Delete old holdings to let runFIFO fully recreate them cleanly
          await dbRun(database, "DELETE FROM Holdings WHERE portfolio = ? OR portfolio = ?", [oldPortfolio, newPortfolio]);
        }
        await dbRun(database, 'COMMIT');
      } catch (err) {
        await dbRun(database, 'ROLLBACK').catch(() => {});
        throw err;
      }`;

content = safeReplace(content, targetMfMigrate, replMfMigrate, 'Batch transaction in migrateMfPortfolios');

// 5. Batch transaction in app.post('/api/family-members')
const targetFam = `    // If portfolios were provided to assign
    if (Array.isArray(portfolios) && portfolios.length > 0) {
      for (const pName of portfolios) {
        await dbRun(db, \`UPDATE Portfolios SET member_id = ? WHERE name = ?\`, [newId, pName]);
        await dbRun(db, \`UPDATE Transactions SET member_id = ? WHERE portfolio = ?\`, [newId, pName]);
        await dbRun(db, \`UPDATE Holdings SET member_id = ? WHERE portfolio = ?\`, [newId, pName]);
        await dbRun(db, \`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (?, ?, 'FULL')\`, [newId, pName]);
      }
    }`;

const replFam = `    // If portfolios were provided to assign
    if (Array.isArray(portfolios) && portfolios.length > 0) {
      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        for (const pName of portfolios) {
          await dbRun(db, \`UPDATE Portfolios SET member_id = ? WHERE name = ?\`, [newId, pName]);
          await dbRun(db, \`UPDATE Transactions SET member_id = ? WHERE portfolio = ?\`, [newId, pName]);
          await dbRun(db, \`UPDATE Holdings SET member_id = ? WHERE portfolio = ?\`, [newId, pName]);
          await dbRun(db, \`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (?, ?, 'FULL')\`, [newId, pName]);
        }
        await dbRun(db, 'COMMIT');
      } catch (err) {
        await dbRun(db, 'ROLLBACK').catch(() => {});
        throw err;
      }
    }`;

content = safeReplace(content, targetFam, replFam, 'Batch transaction in family-members');

// 6. Batch transaction in CAMS initial portfolios
const targetCams = `      for (const mf of initialMfs) {
        const nav = amfiMap.get(mf.isin.toUpperCase()) || 
                    amfiMap.get(mf.name.toUpperCase()) || 
                    amfiMap.get(mf.name.toUpperCase().replace(/\\s+/g, ' ').trim()) || 
                    50.0;
        const units = mf.amount / nav;

        // Add to MasterTickers
        const existingTicker = await dbGet(db, 'SELECT isin FROM MasterTickers WHERE isin = ?', [mf.isin]);
        if (!existingTicker) {
          await dbRun(
            db,
            \`INSERT OR IGNORE INTO MasterTickers (isin, symbol, name, exchange, segment, sector) 
             VALUES (?, ?, ?, 'MUTUAL_FUND', 'MF', 'Mutual Funds')\`,
            [mf.isin, mf.name, mf.name]
          );
        }

        await dbRun(
          db,
          \`INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, batch_id)
           VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?, ?, 'CAMS Auto-Sync', ?)\`,
          [dateStr, portfolioName, mf.isin, mf.name, units, nav, mf.amount, mf.amount, batchId]
        );
        insertedCount++;
      }`;

const replCams = `      if (initialMfs.length > 0) {
        await dbRun(db, 'BEGIN IMMEDIATE');
        try {
          for (const mf of initialMfs) {
            const nav = amfiMap.get(mf.isin.toUpperCase()) || 
                        amfiMap.get(mf.name.toUpperCase()) || 
                        amfiMap.get(mf.name.toUpperCase().replace(/\\s+/g, ' ').trim()) || 
                        50.0;
            const units = mf.amount / nav;

            // Add to MasterTickers
            const existingTicker = await dbGet(db, 'SELECT isin FROM MasterTickers WHERE isin = ?', [mf.isin]);
            if (!existingTicker) {
              await dbRun(
                db,
                \`INSERT OR IGNORE INTO MasterTickers (isin, symbol, name, exchange, segment, sector) 
                 VALUES (?, ?, ?, 'MUTUAL_FUND', 'MF', 'Mutual Funds')\`,
                [mf.isin, mf.name, mf.name]
              );
            }

            await dbRun(
              db,
              \`INSERT INTO Transactions (date, portfolio, type, isin, symbol, quantity, price, gross_amount, net_amount, source, batch_id)
               VALUES (?, ?, 'BUY', ?, ?, ?, ?, ?, ?, 'CAMS Auto-Sync', ?)\`,
              [dateStr, portfolioName, mf.isin, mf.name, units, nav, mf.amount, mf.amount, batchId]
            );
            insertedCount++;
          }
          await dbRun(db, 'COMMIT');
        } catch (err) {
          await dbRun(db, 'ROLLBACK').catch(() => {});
          throw err;
        }
      }`;

content = safeReplace(content, targetCams, replCams, 'Batch transaction in CAMS initial portfolios');

// 7. B3: Parallelize buildDashboardPayload database queries with Promise.all
const targetHoldingsFetch = `    const fxRates = await BankAndFDService.getInstance().getCurrencyRates();
    const usdRate = fxRates.USD || 83.5;

    const rawHoldings = await dbAll(db, holdingsQuery, params);`;

const replHoldingsFetch = `    // Parallelize currency rates and holdings fetch (Finding B3)
    const [fxRates, rawHoldings] = await Promise.all([
      BankAndFDService.getInstance().getCurrencyRates(),
      dbAll(db, holdingsQuery, params)
    ]);
    const usdRate = fxRates.USD || 83.5;`;

content = safeReplace(content, targetHoldingsFetch, replHoldingsFetch, 'B3: Parallelize holdings and FX rates');

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Remediation complete. New server.ts size:', content.length);
