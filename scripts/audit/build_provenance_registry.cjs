const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '../../');
const OUT = path.join(
  ROOT,
  'reports/v65-delivery-2.2/DATA_SOURCE_PROVENANCE_REGISTRY.json'
);

function sha256File(file) {
  if (!fs.existsSync(file)) return null;

  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function sha256String(value) {
  return crypto
    .createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

function git(command, args = []) {
  return execFileSync('git', [command, ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
}

function physicalFile(relativePath) {
  const absolute = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolute)) {
    return {
      path: relativePath,
      exists: false,
      sha256: null,
      sizeBytes: null
    };
  }

  const stat = fs.statSync(absolute);

  return {
    path: relativePath,
    exists: true,
    sha256: sha256File(absolute),
    sizeBytes: stat.size
  };
}

function sqliteDataset() {
  const dbPath = path.join(ROOT, 'data/portfolio.db');

  if (!fs.existsSync(dbPath)) {
    return {
      exists: false,
      sha256: null,
      sizeBytes: null
    };
  }

  const stat = fs.statSync(dbPath);

  const db = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });

  try {
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all();

    const datasets = {};

    for (const table of tables) {
      const tableName = table.name;

      const columns = db.prepare(`
        PRAGMA table_info("${tableName.replace(/"/g, '""')}")
      `).all();

      const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM "${tableName.replace(/"/g, '""')}"
      `).get().count;

      datasets[tableName] = {
        recordCount: Number(count),
        columns: columns.map(c => ({
          name: c.name,
          type: c.type,
          notnull: Boolean(c.notnull),
          pk: Boolean(c.pk)
        }))
      };
    }

    return {
      exists: true,
      sha256: sha256File(dbPath),
      sizeBytes: stat.size,
      datasets
    };
  } finally {
    db.close();
  }
}

function sourceDerivedField(value, source, field) {
  return {
    value: value ?? null,
    evidenceClass: value == null ? 'UNVERIFIED' : 'SOURCE_DERIVED',
    source,
    field
  };
}

function buildDataset(datasetId, sourceAuthority, sourceProvider, artifact) {
  const status =
    artifact.exists && artifact.sha256
      ? 'PHYSICALLY_PRESENT'
      : 'UNVERIFIED';

  return {
    datasetId,
    sourceAuthority,
    sourceProvider,

    artifact: {
      path: artifact.path ?? null,
      sha256: artifact.sha256 ?? null,
      sizeBytes: artifact.sizeBytes ?? null
    },

    provenance: {
      publicationTimestamp: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      },
      observationTimestamp: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      },
      effectiveTimestamp: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      },
      retrievedAt: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      }
    },

    transformation: {
      parserVersion: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      },
      normalizationVersion: {
        value: null,
        evidenceClass: 'UNVERIFIED'
      }
    },

    status
  };
}

function main() {
  const commit = git('rev-parse', ['HEAD']);
  const branch = git('rev-parse', ['--abbrev-ref', 'HEAD']);

  const db = sqliteDataset();

  const registry = {
    registry_version: '3.6D_source_derived',
    generatedAt: new Date().toISOString(),
    generatedAtEvidenceClass: 'AUDIT_EXECUTION_TIME',
    sourceCommit: commit,
    branch,
    workingTreeStatus: git('status', ['--porcelain']),

    datasets: [
      buildDataset(
        'DailyOHLCV',
        'EXCHANGE_SOURCE',
        'NSE',
        {
          path: 'data/portfolio.db',
          exists: db.exists,
          sha256: db.sha256,
          sizeBytes: db.sizeBytes
        }
      ),

      buildDataset(
        'HistoricalFinancialStatements',
        'ISSUER_PRIMARY_FILING',
        'NSE/BSE_XBRL',
        physicalFile('data/raw/financials')
      ),

      buildDataset(
        'HistoricalShareholdingPattern',
        'ISSUER_PRIMARY_FILING',
        'NSE/BSE',
        physicalFile('data/raw/shareholding')
      )
    ],

    databaseInventory: db.datasets,

    integrityRule:
      'No provenance field may be populated unless it is derived from a physical artifact, database record, source response, or executable source metadata.'
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  fs.writeFileSync(
    OUT,
    JSON.stringify(registry, null, 2) + '\n',
    'utf8'
  );

  console.log(`Wrote ${OUT}`);
}

main();
