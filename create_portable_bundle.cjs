const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname);
const dst = 'c:\\Users\\gopal\\Downloads\\webapp_portable_release';

console.log(`[Bundle] Creating clean portable release from ${src} to ${dst}...`);

if (fs.existsSync(dst)) {
  fs.rmSync(dst, { recursive: true, force: true });
}
fs.mkdirSync(dst, { recursive: true });

function copyRecursive(srcDir, dstDir) {
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'backups') continue;
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 1. Copy src, dist, public
console.log('[Bundle] Copying source and build artifacts...');
copyRecursive(path.join(src, 'src'), path.join(dst, 'src'));
copyRecursive(path.join(src, 'dist'), path.join(dst, 'dist'));
if (fs.existsSync(path.join(src, 'public'))) {
  copyRecursive(path.join(src, 'public'), path.join(dst, 'public'));
}

// 2. Copy root configuration and database files
const files = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'server.ts',
  'index.html',
  'portfolio.db',
  'index_db_tables.cjs',
  'create_portable_bundle.cjs',
  'launch_server_and_tunnel.cjs',
  'db_optimize.cjs',
  'cleanup_root.cjs'
];

for (const f of files) {
  const p = path.join(src, f);
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(dst, f));
    console.log(`[Bundle] Copied: ${f}`);
  }
}

// 3. Create start_app.bat
const startBat = `@echo off
title Portfolio Tracker - Local Production Server
echo ========================================================
echo   Starting Portfolio Tracker Local Server
echo ========================================================
echo.
if not exist node_modules (
    echo [INFO] Installing required dependencies...
    npm install --omit=dev
)
echo [INFO] Starting production server on http://localhost:3000 ...
node dist/server.cjs
pause
`;
fs.writeFileSync(path.join(dst, 'start_app.bat'), startBat);

// 4. Create README.md
const readme = `# Portfolio Tracker (Portable Release)

This is the clean, modular, and optimized offline production build of the Portfolio Tracker.

## How to Run Out of the Box:

### Option 1: One-Click Startup (Recommended)
Double click \`start_app.bat\` in this folder.
Open your browser at: **\`http://localhost:3000\`**

### Option 2: Command Line (Development Mode)
\`\`\`bash
npm install
npm run dev
\`\`\`
Open your browser at: **\`http://localhost:5173\`**

### Option 3: Production Server
\`\`\`bash
node dist/server.cjs
\`\`\`
Open your browser at: **\`http://localhost:3000\`**

## Database:
- The active SQLite database is stored locally in \`portfolio.db\` (WAL Mode enabled with automatic WAL checkpointing).
- All your portfolios, transactions, holdings, and custom settings are included out of the box.
`;
fs.writeFileSync(path.join(dst, 'README.md'), readme);

console.log('[Bundle] Portable release successfully created at:', dst);
