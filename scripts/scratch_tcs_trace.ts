import { config as loadEnv } from 'dotenv';
loadEnv();
import express from 'express';
import http from 'http';
import { remoteBridgeRouter } from '../src/server/routes/remoteBridgeRouter.js';

async function runTrace() {
  console.log('--- TCS REAL-DATA TRACE ---');
  const token = process.env.WEALTHOS_REMOTE_KEY;
  if (!token) throw new Error('WEALTHOS_REMOTE_KEY missing');

  const app = express();
  app.use('/api/remote', remoteBridgeRouter);
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const port = address.port;

  const start = performance.now();
  
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: '/api/remote/company/TCS/intelligence',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  }, (res) => {
    const end = performance.now();
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      server.close();
      const body = JSON.parse(raw);
      
      console.log('HTTP Status:', res.statusCode);
      console.log('Response Byte Size:', Buffer.byteLength(raw), 'bytes');
      console.log('Execution Time:', (end - start).toFixed(2), 'ms');
      console.log('Data State:', body.data?.dataState);
      
      if (body.data?.modules) {
        console.log('Major Module Statuses:');
        for (const [mod, val] of Object.entries(body.data.modules)) {
          if (val) {
            console.log(`  - ${mod}: ${(val as any).dataStatus}`);
          }
        }
      }
    });
  });
  
  req.end();
}

runTrace().catch(console.error);
