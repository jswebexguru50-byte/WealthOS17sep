import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');
const lines = fs.readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n');
let prodKey = '';
let reviewKey = '';
let devKey = '';
for (const l of lines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) {
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (k === 'WEALTHOS_PRODUCT_KEY') prodKey = v;
    if (k === 'WEALTHOS_REVIEW_KEY') reviewKey = v;
    if (k === 'WEALTHOS_DEV_KEY') devKey = v;
  }
}

console.log('Client loaded keys:');
console.log('PRODUCT_KEY length:', prodKey.length, 'starts with:', prodKey.slice(0, 10));
console.log('REVIEW_KEY length:', reviewKey.length, 'starts with:', reviewKey.slice(0, 10));
console.log('DEV_KEY length:', devKey.length, 'starts with:', devKey.slice(0, 10));

function check(tokenName: string, token: string, path: string) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8787,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        console.log(`[${tokenName}] -> ${path}: status=${res.statusCode}, body=${b.slice(0, 150)}`);
        resolve(null);
      });
    });
    req.write(data);
    req.end();
  });
}

async function run() {
  await check('PRODUCT_KEY', prodKey, '/mcp');
  await check('REVIEW_KEY', reviewKey, '/mcp/review');
  await check('DEV_KEY', devKey, '/mcp/dev');
}
run();
