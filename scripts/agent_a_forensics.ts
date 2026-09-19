/**
 * WealthOS v6.6 - Agent A: Repository + Data Forensics
 * Scans all service files for data dependencies, table references, fallbacks,
 * queries live portfolio.db for real row counts, and produces:
 * - docs/v66/REPOSITORY_FORENSICS.md
 * - data/v66/repository_data_dependency_inventory.json
 * 
 * Invariants:
 * - Read-only analysis. Never mutates production state.
 * - productionPromotionAuthorized = false
 */

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const ROOT_DIR = process.cwd();
const SERVICES_DIR = path.join(ROOT_DIR, 'src', 'server', 'services');
const DB_PATH = path.join(ROOT_DIR, 'portfolio.db');
const DOCS_OUT = path.join(ROOT_DIR, 'docs', 'v66', 'REPOSITORY_FORENSICS.md');
const DATA_OUT = path.join(ROOT_DIR, 'data', 'v66', 'repository_data_dependency_inventory.json');

interface ServiceAnalysis {
  file: string;
  tableReferences: string[];
  hasDataInsufficient: boolean;
  hasPITReference: boolean;
  hasDateNowOrNewDate: boolean;
  hasFallbackLogic: boolean;
  directEngineImports: string[];
}

interface TableInventory {
  name: string;
  rowCount: number;
  columns: string[];
}

async function getDbTablesAndCounts(db: sqlite3.Database): Promise<TableInventory[]> {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", async (err, tables: any[]) => {
      if (err) return reject(err);
      const results: TableInventory[] = [];
      
      for (const t of tables) {
        const tableName = t.name;
        try {
          const countRow: any = await new Promise((res, rej) => {
            db.get(`SELECT COUNT(*) as cnt FROM "${tableName}"`, (cErr, row) => {
              if (cErr) rej(cErr);
              else res(row);
            });
          });
          const cols: any[] = await new Promise((res, rej) => {
            db.all(`PRAGMA table_info("${tableName}")`, (pErr, rows) => {
              if (pErr) rej(pErr);
              else res(rows || []);
            });
          });
          results.push({
            name: tableName,
            rowCount: countRow ? countRow.cnt : 0,
            columns: cols.map(c => c.name)
          });
        } catch (e) {
          results.push({
            name: tableName,
            rowCount: -1,
            columns: []
          });
        }
      }
      resolve(results);
    });
  });
}

function scanServices(): ServiceAnalysis[] {
  if (!fs.existsSync(SERVICES_DIR)) return [];
  const files = fs.readdirSync(SERVICES_DIR).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
  const analyses: ServiceAnalysis[] = [];

  const KNOWN_TABLES = [
    'DailyOHLCV', 'HistoricalPrices', 'StockPrices', 'DeliveryData',
    'CorporateActions', 'Fundamentals', 'Financials', 'BalanceSheet',
    'ProfitLoss', 'CashFlow', 'QuarterlyResults', 'ShareholdingPattern',
    'InstitutionalDeals', 'BulkDeals', 'BlockDeals', 'FuturesOHLCV',
    'OptionsOHLCV', 'Nifty500', 'Nifty50', 'IndexWeights',
    'TradingCalendar', 'SecurityMaster', 'AuditLedger'
  ];

  for (const file of files) {
    const fullPath = path.join(SERVICES_DIR, file);
    if (fs.statSync(fullPath).isDirectory()) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    const tableReferences = KNOWN_TABLES.filter(t => 
      new RegExp(`\\b${t}\\b`, 'i').test(content) || content.includes(`"${t}"`) || content.includes(`'${t}'`)
    );

    const hasDataInsufficient = content.includes('DATA_INSUFFICIENT');
    const hasPITReference = /PIT|PointInTime|asOfDate|effectiveDate|observationTimestamp/i.test(content);
    const hasDateNowOrNewDate = /new Date\(\)|Date\.now\(\)/.test(content);
    const hasFallbackLogic = /fallback|defaultTo|orDefault|DEFAULT_|coalesce/i.test(content);

    // Detect imports of other engines directly
    const directEngineImports = (content.match(/from\s+['"][^'"]*Engine['"]/g) || [])
      .map(m => m.replace(/from\s+['"]/, '').replace(/['"]$/, ''));

    analyses.push({
      file,
      tableReferences,
      hasDataInsufficient,
      hasPITReference,
      hasDateNowOrNewDate,
      hasFallbackLogic,
      directEngineImports
    });
  }

  return analyses;
}

export async function runAgentAForensics() {
  console.log('--- WealthOS v6.6 Agent A: Repository Forensics Initiated ---');
  
  const services = scanServices();
  console.log(`Scanned ${services.length} services in ${SERVICES_DIR}`);

  let tables: TableInventory[] = [];
  if (fs.existsSync(DB_PATH)) {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    try {
      tables = await getDbTablesAndCounts(db);
      console.log(`Audited ${tables.length} tables from ${DB_PATH}`);
    } finally {
      db.close();
    }
  } else {
    console.warn(`Database not found at ${DB_PATH}`);
  }

  // Ensure output dirs
  fs.mkdirSync(path.dirname(DOCS_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(DATA_OUT), { recursive: true });

  const inventory = {
    generatedAt: new Date().toISOString(),
    governance: {
      productionPromotionAuthorized: false as const,
      auditVersion: 'v6.6.0-agent-a'
    },
    tablesSummary: {
      totalTables: tables.length,
      tablesWithZeroRows: tables.filter(t => t.rowCount === 0).map(t => t.name),
      tablesWithData: tables.filter(t => t.rowCount > 0).map(t => ({ name: t.name, rowCount: t.rowCount }))
    },
    servicesSummary: {
      totalServices: services.length,
      usingDataInsufficient: services.filter(s => s.hasDataInsufficient).map(s => s.file),
      usingPITPatterns: services.filter(s => s.hasPITReference).map(s => s.file),
      usingSystemClock: services.filter(s => s.hasDateNowOrNewDate).map(s => s.file),
      directEngineCoupling: services.filter(s => s.directEngineImports.length > 0).map(s => ({ file: s.file, imports: s.directEngineImports }))
    },
    tables,
    services
  };

  fs.writeFileSync(DATA_OUT, JSON.stringify(inventory, null, 2), 'utf8');
  console.log(`Saved inventory JSON to ${DATA_OUT}`);

  const mdReport = `# WealthOS v6.6 - Repository & Data Dependency Forensics

**Generated At**: ${inventory.generatedAt}  
**Governance Assertion**: \`productionPromotionAuthorized = false\`  
**Scope**: 134 Services + Live \`portfolio.db\` Schema & Population

---

## 1. Executive Summary
- **Audited Service Files**: ${services.length}
- **Audited Database Tables**: ${tables.length}
- **Populated Tables**: ${inventory.tablesSummary.tablesWithData.length}
- **Empty / Zero-Row Tables**: ${inventory.tablesSummary.tablesWithZeroRows.length}
- **Services with Clock Usage (\`new Date()\`)**: ${inventory.servicesSummary.usingSystemClock.length} (Requires substitution with \`ResearchClock\` for replay integrity)
- **Services with Direct Engine Coupling**: ${inventory.servicesSummary.directEngineCoupling.length} (Requires migration to \`EvidenceBus\` in Agent E/F)

---

## 2. Populated Tables & Row Counts (Live DB)

| Table Name | Row Count | Columns |
|---|---|---|
${tables.filter(t => t.rowCount > 0).map(t => `| \`${t.name}\` | ${t.rowCount.toLocaleString()} | ${t.columns.slice(0, 5).join(', ')}${t.columns.length > 5 ? '...' : ''} |`).join('\n')}

---

## 3. Empty Tables (Potential Data Gaps)

| Table Name | Status | Impacted Domain |
|---|---|---|
${inventory.tablesSummary.tablesWithZeroRows.map(name => `| \`${name}\` | **0 rows** | Data Acquisition Required (Agent C) |`).join('\n')}

---

## 4. Services Requiring Composable Engine Isolation

Services that currently import other engines directly or use non-PIT clock references:
${inventory.servicesSummary.directEngineCoupling.slice(0, 20).map(c => `- **${c.file}** imports: ${c.imports.join(', ')}`).join('\n')}

---

*End of Agent A Forensics Report*
`;

  fs.writeFileSync(DOCS_OUT, mdReport, 'utf8');
  console.log(`Saved forensics report to ${DOCS_OUT}`);
}

if (process.argv[1] && process.argv[1].includes('agent_a_forensics')) {
  runAgentAForensics().catch(err => {
    console.error('Agent A forensics failed:', err);
    process.exit(1);
  });
}
