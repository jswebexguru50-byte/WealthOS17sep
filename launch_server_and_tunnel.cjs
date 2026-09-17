const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🚀 LAUNCHING PORTFOLIO TRACKER APP & PUBLIC TUNNEL 🚀');
console.log('====================================================\n');

async function main() {
  // 1. Build frontend with Vite
  try {
    const { build: viteBuild } = await import('vite');
    console.log('1. Compiling frontend with Vite -> dist/ ...');
    await viteBuild();
    console.log('✅ Frontend build completed successfully.');
  } catch (e) {
    console.warn('⚠️ Frontend build notice:', e.message);
  }

  // 2. Build server.ts to dist/server.cjs
  try {
    const esbuild = require('esbuild');
    console.log('2. Compiling server.ts -> dist/server.cjs ...');
    esbuild.buildSync({
      entryPoints: ['server.ts'],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      sourcemap: true,
      outfile: 'dist/server.cjs'
    });
    console.log('✅ Server bundle compiled successfully.');
  } catch (e) {
    console.warn('⚠️ Server build notice:', e.message);
  }

  // 3. Start App Production Server
  console.log('3. Starting Local App Server on Port 3000...');
  const serverProc = spawn('node', ['dist/server.cjs'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production', PORT: '3000' }
  });
  serverProc.on('error', (err) => console.error('Server process error:', err));
}

main().catch(console.error);


// ── CLOUDFLARE TUNNEL DISABLED (local-only mode) ──────────────────────────────
// To re-enable, uncomment the entire block below and restore the SIGINT handler.
//
// // 2. Start Cloudflare Tunnel
// console.log('\n2. Initializing Cloudflare Public Tunnel...');
// const cfProc = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000'], {
//   shell: true,
//   stdio: ['ignore', 'pipe', 'pipe']
// });
//
// let tunnelUrlFound = false;
//
// function handleOutput(data) {
//   const str = data.toString();
//   const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
//   if (match && !tunnelUrlFound) {
//     tunnelUrlFound = true;
//     console.log('\n====================================================');
//     console.log('🎉 SUCCESS! YOUR PUBLIC APP IS LIVE AT THE URL BELOW:');
//     console.log('👉 ' + match[0]);
//     console.log('👉 Local Access: http://localhost:3000');
//     console.log('====================================================\n');
//   }
// }
//
// cfProc.stdout.on('data', handleOutput);
// cfProc.stderr.on('data', handleOutput);
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n✅ App running in LOCAL-ONLY mode.');
console.log('👉 Open in browser: http://localhost:3000\n');

process.on('SIGINT', () => {
  console.log('\nStopping server...');
  serverProc.kill();
  // cfProc.kill();  // re-enable when tunnel is active
  process.exit();
});
