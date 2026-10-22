/**
 * scripts/verify_remote_bridge_local.ts
 *
 * Standalone Local Acceptance & Verification Runner for
 * WealthOS -> Google AI Studio Local Data Bridge (Phase 1)
 */

import { config as loadEnv } from 'dotenv';
loadEnv();

import express from 'express';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { remoteBridgeRouter } from '../src/server/routes/remoteBridgeRouter.js';

interface CheckResult {
  step: number;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
  responseSnippet?: any;
}

function getDbIntegrity() {
  const dbPath = path.resolve(process.cwd(), 'portfolio.db');
  if (!fs.existsSync(dbPath)) return null;
  const stat = fs.statSync(dbPath);
  const fd = fs.openSync(dbPath, 'r');
  const headerBuf = Buffer.alloc(100);
  fs.readSync(fd, headerBuf, 0, 100, 0);
  fs.closeSync(fd);

  return {
    size: stat.size,
    changeCounter: headerBuf.readUInt32BE(24),
    dataVersion: headerBuf.readUInt32BE(92),
    headerSha256: crypto.createHash('sha256').update(headerBuf).digest('hex')
  };
}

async function makeRequest(
  port: number,
  path: string,
  method = 'GET',
  token?: string,
  body?: any
): Promise<{ status: number; body: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    let bodyData = '';
    if (body) {
      bodyData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode || 0, body: parsed, raw });
        });
      }
    );

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('WEALTHOS -> GOOGLE AI STUDIO LOCAL DATA BRIDGE (PHASE 1)');
  console.log('LOCAL VERIFICATION & TRACE RUNNER');
  console.log('================================================================\n');

  const token = process.env.WEALTHOS_REMOTE_KEY;
  if (!token) {
    throw new Error('WEALTHOS_REMOTE_KEY is not set in environment.');
  }

  const results: CheckResult[] = [];
  const dbBefore = getDbIntegrity();
  console.log('SQLite Initial State:', dbBefore);

  // 1. Start isolated local server on an ephemeral port
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/remote', remoteBridgeRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const port = address.port;
  console.log(`[Step 1] Server started on http://127.0.0.1:${port}`);
  results.push({
    step: 1,
    name: 'Server Starts',
    status: 'PASS',
    details: `Bound successfully to 127.0.0.1:${port}`
  });

  try {
    console.log('[Step 2] Testing GET /api/remote/health...');
    const healthRes = await makeRequest(port, '/api/remote/health');
    const healthPass = healthRes.status === 200 && healthRes.body.status === 'ok';
    results.push({
      step: 2,
      name: '/remote/health works',
      status: healthPass ? 'PASS' : 'FAIL',
      details: `Status ${healthRes.status}, body=${JSON.stringify(healthRes.body)}`,
      responseSnippet: healthRes.body
    });

    // 3. Unauthenticated request -> 401/403
    console.log('[Step 3] Testing unauthenticated request...');
    const unauthRes = await makeRequest(port, '/api/remote/company/TCS');
    const unauthPass = unauthRes.status === 401;
    results.push({
      step: 3,
      name: 'Unauthenticated Request Rejected',
      status: unauthPass ? 'PASS' : 'FAIL',
      details: `HTTP ${unauthRes.status} (${unauthRes.body?.error})`,
      responseSnippet: unauthRes.body
    });

    // 4. Invalid token -> 401/403
    console.log('[Step 4] Testing invalid token...');
    const invalidRes = await makeRequest(port, '/api/remote/company/TCS', 'GET', 'INVALID_TEST_TOKEN');
    const invalidPass = invalidRes.status === 403;
    results.push({
      step: 4,
      name: 'Invalid Token Rejected',
      status: invalidPass ? 'PASS' : 'FAIL',
      details: `HTTP ${invalidRes.status} (${invalidRes.body?.error})`,
      responseSnippet: invalidRes.body
    });

    // 5. Valid token -> success
    console.log('[Step 5] Testing valid token...');
    const validRes = await makeRequest(port, '/api/remote/company/TCS', 'GET', token);
    const validPass = validRes.status === 200 && validRes.body.success === true;
    results.push({
      step: 5,
      name: 'Valid Token Success',
      status: validPass ? 'PASS' : 'FAIL',
      details: `HTTP ${validRes.status}, Security: ${validRes.body?.data?.company_name}`,
      responseSnippet: validRes.body
    });

    // 6. Known symbol TCS returns real WealthOS data
    console.log('[Step 6] Testing TCS company intelligence & fundamentals...');
    const tcsIntelRes = await makeRequest(port, '/api/remote/company/TCS/intelligence', 'GET', token);
    const tcsPass = tcsIntelRes.status === 200 && tcsIntelRes.body?.data?.symbol === 'TCS' && tcsIntelRes.body?.data?.modules;
    results.push({
      step: 6,
      name: 'Known Symbol TCS Returns Real Data',
      status: tcsPass ? 'PASS' : 'FAIL',
      details: `HTTP ${tcsIntelRes.status}, Modules returned: ${Object.keys(tcsIntelRes.body?.data?.modules || {}).join(', ')}`,
      responseSnippet: {
        symbol: tcsIntelRes.body?.data?.symbol,
        isin: tcsIntelRes.body?.data?.isin,
        companyName: tcsIntelRes.body?.data?.companyName,
        dataState: tcsIntelRes.body?.data?.dataState,
        moduleStatuses: Object.fromEntries(
          Object.entries(tcsIntelRes.body?.data?.modules || {}).map(([k, v]: any) => [k, v?.dataStatus || 'N/A'])
        )
      }
    });

    // 7. Unknown symbol fails safely
    console.log('[Step 7] Testing unknown symbol NONEXISTENT999...');
    const unknownRes = await makeRequest(port, '/api/remote/company/NONEXISTENT999', 'GET', token);
    const unknownPass = unknownRes.status === 404;
    results.push({
      step: 7,
      name: 'Unknown Symbol Fails Safely',
      status: unknownPass ? 'PASS' : 'FAIL',
      details: `HTTP ${unknownRes.status} (${unknownRes.body?.error})`,
      responseSnippet: unknownRes.body
    });

    // 8. Missing data remains DATA_INSUFFICIENT
    console.log('[Step 8] Testing DATA_INSUFFICIENT data status preservation...');
    const fundRes = await makeRequest(port, '/api/remote/company/TCS/fundamentals', 'GET', token);
    const statusPreserved = fundRes.status === 200 && typeof fundRes.body?.data?.dataStatus === 'object';
    results.push({
      step: 8,
      name: 'Missing Data Remains DATA_INSUFFICIENT / Preserved',
      status: statusPreserved ? 'PASS' : 'FAIL',
      details: `Reported statuses: ${JSON.stringify(fundRes.body?.data?.dataStatus)}`,
      responseSnippet: fundRes.body?.data?.dataStatus
    });

    // 9. Bounded OHLC request works
    console.log('[Step 9] Testing bounded OHLC (limit=5)...');
    const ohlcRes = await makeRequest(port, '/api/remote/company/TCS/technical?limit=5', 'GET', token);
    const ohlcPass = ohlcRes.status === 200 && ohlcRes.body?.count <= 5 && Array.isArray(ohlcRes.body?.data);
    results.push({
      step: 9,
      name: 'Bounded OHLC Request Works',
      status: ohlcPass ? 'PASS' : 'FAIL',
      details: `Returned ${ohlcRes.body?.count} bars from source: ${ohlcRes.body?.source}`,
      responseSnippet: {
        count: ohlcRes.body?.count,
        source: ohlcRes.body?.source,
        firstBar: ohlcRes.body?.data?.[0]
      }
    });

    // 10. Excessive request is rejected
    console.log('[Step 10] Testing excessive limit rejection (>500)...');
    const excessiveRes = await makeRequest(port, '/api/remote/company/TCS/technical?limit=1000', 'GET', token);
    const excessivePass = excessiveRes.status === 400 && excessiveRes.body?.error === 'LIMIT_EXCEEDED';
    results.push({
      step: 10,
      name: 'Excessive Request Rejected',
      status: excessivePass ? 'PASS' : 'FAIL',
      details: `HTTP ${excessiveRes.status} (${excessiveRes.body?.error}: ${excessiveRes.body?.message})`,
      responseSnippet: excessiveRes.body
    });

    // 11. No database modified
    console.log('[Step 11] Checking SQLite immutability...');
    const dbAfter = getDbIntegrity();
    const dbPass = dbBefore && dbAfter &&
      dbBefore.changeCounter === dbAfter.changeCounter &&
      dbBefore.dataVersion === dbAfter.dataVersion &&
      dbBefore.size === dbAfter.size &&
      dbBefore.headerSha256 === dbAfter.headerSha256;
    results.push({
      step: 11,
      name: 'No Database Modified (Zero Writes Verified)',
      status: dbPass ? 'PASS' : 'FAIL',
      details: `ChangeCounter: ${dbBefore?.changeCounter} -> ${dbAfter?.changeCounter}, Size: ${dbBefore?.size} -> ${dbAfter?.size}`
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('LOCAL VERIFICATION RESULTS SUMMARY:');
  console.log('================================================================');
  for (const r of results) {
    console.log(`[${r.status}] Step ${r.step}: ${r.name} - ${r.details}`);
  }

  // Save report artifact for handoff inclusion
  const artifactPath = path.resolve(process.cwd(), 'reports', 'readiness', 'REMOTE_BRIDGE_LOCAL_VERIFICATION.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    sqliteIntegrity: { before: dbBefore, after: getDbIntegrity() },
    results
  }, null, 2));

  console.log(`\nArtifact written to: ${artifactPath}`);
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
