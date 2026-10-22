#!/usr/bin/env node
/**
 * Applies only direct Trendlyne sector classifications for blank MasterTickers
 * sectors. The provider evidence and every applied change are retained in a
 * local audit artifact. No schema changes and no new records are created.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const evidencePath = path.join(root, 'data/fundamental_enrichment/trendlyne_industry_candidates.json');
const proxyMapPath = path.join(root, 'data/fundamental_enrichment/trendlyne_sector_to_nse_index_proxy_map.json');
const auditPath = path.join(root, 'data/fundamental_enrichment/masterticker_trendlyne_sector_updates.json');
const apply = process.argv.includes('--apply');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const approvedSectors = new Set(Object.keys(JSON.parse(fs.readFileSync(proxyMapPath, 'utf8')).mappings || {}));
const candidates = (evidence.rows || []).filter(row => row.extractionStatus === 'AVAILABLE' && approvedSectors.has(row.trendlyneSector));
const db = new Database(path.join(root, 'portfolio.db'));
const select = db.prepare('SELECT symbol, sector FROM MasterTickers WHERE UPPER(symbol) = ?');
const update = db.prepare("UPDATE MasterTickers SET sector = ? WHERE UPPER(symbol) = ? AND (sector IS NULL OR TRIM(sector) = '')");
const changes = [];
for (const row of candidates) {
  const before = select.get(String(row.symbol).toUpperCase());
  if (!before || String(before.sector || '').trim()) continue;
  const change = {
    symbol: String(row.symbol).toUpperCase(), beforeSector: before.sector || null,
    afterSector: row.trendlyneSector, provider: 'TRENDLYNE_MCP',
    providerEndpoint: row.endpoint, providerFetchedAt: row.fetchedAt,
    providerIndustry: row.industry || null,
    mappingType: 'DIRECT_PROVIDER_SECTOR_WITH_NSE_INDEX_PROXY',
  };
  if (apply) update.run(change.afterSector, change.symbol);
  changes.push(change);
}
db.close();
fs.writeFileSync(auditPath, JSON.stringify({
  generatedAt: new Date().toISOString(), applied: apply, candidateEvidenceCount: candidates.length,
  changes, skippedOrUnmappedCount: (evidence.rows || []).length - candidates.length,
}, null, 2));
console.log(JSON.stringify({ apply, evidenceCandidates: candidates.length, changes: changes.length, auditPath }));
