const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const tempDir = path.join(rootDir, 'temp_source_bundle');
const zipFile = path.join(rootDir, 'WealthOS_Source_Release.zip');

console.log('[Zip Bundle] Preparing clean source package...');

if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

const excludeDirs = new Set([
  'node_modules',
  '.git',
  '.agent',
  '.agents',
  '.claude',
  '.vscode',
  '.reviews',
  'backups',
  'dist',
  'temp_source_bundle',
  'artifacts',
  'uploads',
  'portfolio_mobile_s24'
]);

const excludeExtensions = new Set([
  '.db',
  '.sqlite',
  '.sqlite3',
  '.db-wal',
  '.db-shm',
  '.zip',
  '.exe',
  '.log',
  '.err',
  '.xlsx',
  '.xls',
  '.pdf'
]);

function shouldExcludeFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (excludeExtensions.has(ext)) return true;
  if (fileName.startsWith('portfolio.db')) return true;
  if (fileName.startsWith('portfolio_backup')) return true;
  if (fileName.startsWith('intraday_history')) return true;
  if (fileName.startsWith('nri_wealth')) return true;
  if (fileName.startsWith('repomix-output')) return true;
  if (fileName === '.env') return true;
  if (fileName === '0') return true;
  return false;
}

function copyRecursive(srcDir, dstDir) {
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      copyRecursive(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
    } else if (entry.isFile()) {
      if (shouldExcludeFile(entry.name)) continue;
      fs.copyFileSync(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
    }
  }
}

// Copy source tree
console.log('[Zip Bundle] Gathering clean source files...');
copyRecursive(rootDir, tempDir);

console.log('[Zip Bundle] Compressing into WealthOS_Source_Release.zip...');
// Use PowerShell to compress
const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipFile}' -CompressionLevel Optimal -Force"`;
execSync(psCmd, { stdio: 'inherit' });

// Cleanup temp folder
fs.rmSync(tempDir, { recursive: true, force: true });

const stats = fs.statSync(zipFile);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`[Zip Bundle] Done! Archive created at: ${zipFile} (${sizeMB} MB)`);
