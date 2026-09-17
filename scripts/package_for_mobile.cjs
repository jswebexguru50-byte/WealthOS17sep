const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'portfolio_mobile_s24');
const zipPath = path.join(rootDir, 'portfolio_mobile_s24.zip');

console.log('📦 Creating clean mobile portable release for Samsung S24 Ultra...');

// Remove existing outDir if exists
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Copy dist/
const copyRecursive = (src, dest) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
};

console.log('1. Copying dist/ bundle...');
copyRecursive(path.join(rootDir, 'dist'), path.join(outDir, 'dist'));

console.log('2. Copying portfolio.db...');
if (fs.existsSync(path.join(rootDir, 'portfolio.db'))) {
  fs.copyFileSync(path.join(rootDir, 'portfolio.db'), path.join(outDir, 'portfolio.db'));
}

console.log('3. Copying start scripts...');
['termux_start.sh', 'termux_setup.sh'].forEach(f => {
  if (fs.existsSync(path.join(rootDir, f))) {
    fs.copyFileSync(path.join(rootDir, f), path.join(outDir, f));
  }
});

// Create clean production package.json
const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const mobilePkg = {
  name: 'nri-wealthos-mobile',
  version: '3.0.0',
  private: true,
  type: 'module',
  scripts: {
    start: 'node dist/server.cjs'
  },
  dependencies: {
    ...rootPkg.dependencies
  }
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(mobilePkg, null, 2));

// Create README_MOBILE.md
const readmeContent = `# NRI WealthOS — Mobile Standalone Release for Samsung Galaxy S24 Ultra

This package is configured to run locally on your **Samsung Galaxy S24 Ultra** using **Termux**.
Both frontend, backend API, and SQLite database run **100% locally on your phone** without any external dependencies or lag.

---

## 🚀 Quick Start in 3 Easy Steps

### Step 1: Copy to Phone
1. Transfer the \`portfolio_mobile_s24\` folder (or extract \`portfolio_mobile_s24.zip\`) onto your phone's internal storage (e.g. \`Download/portfolio_mobile_s24\`).

### Step 2: Open Termux & Setup
Open **Termux** on your phone and run:
\`\`\`bash
# Grant Termux storage permission (if not already done)
termux-setup-storage

# Copy to Termux home directory for maximum NVMe I/O speed:
cp -r /sdcard/Download/portfolio_mobile_s24 ~/portfolio
cd ~/portfolio

# Run setup (only needed the first time):
bash termux_setup.sh
\`\`\`

### Step 3: Launch & Open in Browser
Once setup is done (or whenever you want to run the app in the future):
\`\`\`bash
cd ~/portfolio
bash termux_start.sh
\`\`\`

Open **Chrome** or **Samsung Internet** and visit:
👉 **http://localhost:3000**

---

## ⚡ Performance Optimizations for Samsung S24 Ultra
- **120Hz Smooth Scrolling**: Pre-compiled production React 19 chunks with hardware-accelerated CSS.
- **Low Memory Footprint**: Bounded V8 heap (\`--max-old-space-size=512\`) to keep phone battery usage negligible.
- **Mobile Bottom Navigation**: 1-tap switching between Command Center, Dashboard, Analytics & Performance, and Tax & FEMA.
- **Offline / Local SQLite**: Zero network lag on local data queries.
`;

fs.writeFileSync(path.join(outDir, 'README_MOBILE.md'), readmeContent);

console.log('4. Creating ZIP archive...');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}
const zip = new AdmZip();
zip.addLocalFolder(outDir);
zip.writeZip(zipPath);

console.log(`✅ Mobile bundle ready:`);
console.log(`   📁 Directory: ${outDir}`);
console.log(`   📦 Zip File:  ${zipPath}`);
