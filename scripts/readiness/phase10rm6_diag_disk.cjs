#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check disk free space
try {
  const out = execSync('powershell -command "Get-PSDrive C | Select-Object Used,Free"', { encoding: 'utf8' });
  console.log('Disk (C:):\n', out.trim());
} catch(e) {
  console.log('Disk check error:', e.message);
}

// Check backup dir
const BACKUP_DIR = 'reports/readiness/runtime/m6/artifacts';
if (fs.existsSync(BACKUP_DIR)) {
  const files = fs.readdirSync(BACKUP_DIR);
  let totalBytes = 0;
  files.forEach(f => {
    const st = fs.statSync(path.join(BACKUP_DIR, f));
    const gb = (st.size/1024/1024/1024).toFixed(2);
    console.log(`  ${f}  ${gb} GB`);
    totalBytes += st.size;
  });
  console.log(`Total in backup dir: ${(totalBytes/1024/1024/1024).toFixed(2)} GB`);
} else {
  console.log('Backup dir not found:', BACKUP_DIR);
}

// Source
const st = fs.statSync('portfolio.db');
console.log(`portfolio.db: ${(st.size/1024/1024/1024).toFixed(2)} GB`);

// Check failures.jsonl for the actual crash reason
const failPath = 'reports/readiness/runtime/m6/failures.jsonl';
if (fs.existsSync(failPath)) {
  const lines = fs.readFileSync(failPath, 'utf8').split('\n').filter(l => l.trim());
  const last5 = lines.slice(-5);
  console.log('\nLast 5 failure entries:');
  last5.forEach(l => console.log(' ', l));
}
