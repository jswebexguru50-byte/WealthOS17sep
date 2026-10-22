/**
 * Test remote HTTPS tunnel endpoint
 * Satisfies: Task 11 of Acceptance Specification
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
const lines = fs.readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n');
let prodKey = '';
let reviewKey = '';

for (const l of lines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) {
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (k === 'WEALTHOS_PRODUCT_KEY') prodKey = v;
    if (k === 'WEALTHOS_REVIEW_KEY') reviewKey = v;
  }
}

// Find tunnel URL from cloudflare log or gateway log
const logFile = path.join(process.env.TEMP || '', 'wealthos_cf_tunnel.log');
const logContent = fs.readFileSync(logFile, 'utf-8');
const allMatches = Array.from(logContent.matchAll(/https:\/\/([a-zA-Z0-9\-]+)\.trycloudflare\.com/g));
let tunnelUrl = '';
for (const m of allMatches) {
  if (m[1] !== 'api') {
    tunnelUrl = m[0];
    break;
  }
}

console.log('Tunnel URL detected:', tunnelUrl ? `${tunnelUrl.slice(0, 15)}...trycloudflare.com` : 'NONE');
if (!tunnelUrl) {
  console.error('FAIL: No tunnel URL found');
  process.exit(1);
}

function requestHttps(urlStr: string, body: any, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = JSON.stringify(body);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function verifyRemote() {
  console.log('--- REMOTE TUNNEL VERIFICATION ---');

  // 1. initialize = PASS
  const initRes = await requestHttps(`${tunnelUrl}/mcp/review`, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'chatgpt-reviewer-probe', version: '1.0' },
      capabilities: {}
    }
  }, reviewKey);
  const initPass = initRes.status === 200 && initRes.body?.result?.protocolVersion === '2024-11-05';
  console.log(`REMOTE_INITIALIZE = ${initPass ? 'PASS' : 'FAIL'} (status=${initRes.status}, version=${initRes.body?.result?.protocolVersion})`);

  // 2. tools/list using REVIEW authentication = PASS
  const toolsRes = await requestHttps(`${tunnelUrl}/mcp/review`, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  }, reviewKey);
  const tools = toolsRes.body?.result?.tools || [];
  console.log('Returned tool count:', tools.length);
  console.log('Returned tools:', tools.map((t: any) => t.name).sort());
  const toolsListPass = toolsRes.status === 200 && Array.isArray(tools) && tools.length >= 28;
  console.log(`REMOTE_TOOLS_LIST = ${toolsListPass ? 'PASS' : 'FAIL'} (status=${toolsRes.status}, toolCount=${tools?.length})`);

  // 3. unauthorized request = 401
  const unauthRes = await requestHttps(`${tunnelUrl}/mcp/review`, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/list',
    params: {}
  }, 'invalid_token_99999');
  const unauthPass = unauthRes.status === 401;
  console.log(`REMOTE_AUTH_REJECTION = ${unauthPass ? 'PASS' : 'FAIL'} (status=${unauthRes.status})`);

  // 4. PRODUCT credential cannot access REVIEW plane (403)
  const wrongPlaneRes = await requestHttps(`${tunnelUrl}/mcp/review`, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/list',
    params: {}
  }, prodKey);
  const wrongPlanePass = wrongPlaneRes.status === 403 || wrongPlaneRes.body?.error?.message?.includes('INSUFFICIENT_PRIVILEGES');
  console.log(`REVIEW_PLANE_ISOLATION = ${wrongPlanePass ? 'PASS' : 'FAIL'} (status=${wrongPlaneRes.status}, error=${wrongPlaneRes.body?.error?.message})`);

  // 5. REVIEW profile exposes only intended reviewer tools
  const exposedNames = new Set((tools || []).map((t: any) => t.name));
  const hasDevSessionTools = exposedNames.has('resume_development_session') || exposedNames.has('cancel_remediation');
  const hasFundamental = exposedNames.has('get_fundamental_review_inputs') && exposedNames.has('record_fundamental_review');
  const profilePass = !hasDevSessionTools && hasFundamental && exposedNames.size === 28;
  console.log(`REVIEW_PROFILE_SURFACE = ${profilePass ? 'PASS' : 'FAIL'} (exposedCount=${exposedNames.size}, devMutationBlocked=${!hasDevSessionTools})`);

  return {
    initPass,
    toolsListPass,
    unauthPass,
    wrongPlanePass,
    profilePass,
    redactedUrl: tunnelUrl.replace(/https:\/\/[a-z0-9\-]+/, 'https://[REDACTED_TUNNEL_HOST]')
  };
}

verifyRemote().then(r => {
  const allPass = r.initPass && r.toolsListPass && r.unauthPass && r.wrongPlanePass && r.profilePass;
  if (!allPass) process.exit(1);
}).catch(err => {
  console.error('Remote verify failed:', err);
  process.exit(1);
});
