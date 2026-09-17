const { execSync, spawn } = require('child_process');

console.log('Finding and stopping any process on port 3000...');
try {
  const out = execSync('netstat -ano | findstr :3000', { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  const pids = new Set();
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[1].includes(':3000')) {
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
  }
  for (const pid of pids) {
    console.log(`Killing process ${pid}...`);
    try {
      execSync(`taskkill /F /PID ${pid}`);
    } catch(e) {}
  }
} catch (e) {
  console.log('No existing process on port 3000 or error checking.');
}

console.log('Starting production server dist/server.cjs in background...');
const fs = require('fs');
const outLog = fs.openSync('server.log', 'a');
const errLog = fs.openSync('server.log', 'a');

const proc = spawn('node', ['dist/server.cjs'], {
  detached: true,
  stdio: ['ignore', outLog, errLog],
  env: { ...process.env, NODE_ENV: 'production', PORT: '3000' }
});
proc.unref();

console.log(`Server started with PID ${proc.pid}`);
