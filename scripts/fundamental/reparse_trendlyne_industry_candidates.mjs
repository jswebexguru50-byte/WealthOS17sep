#!/usr/bin/env node
/** Re-extract only already-saved Trendlyne overview evidence; makes no MCP calls. */
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'data/fundamental_enrichment/trendlyne_industry_candidates.json');
const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));

function textOf(raw) {
  return (raw?.content || []).filter(item => item?.type === 'text').map(item => String(item.text || '')).join('\n');
}

function field(text, name) {
  return text.match(new RegExp(`sectorIndustryData:\\s*[\\s\\S]*?\\n\\s*${name}:\\s*([^\\n\\r]+)`, 'i'))?.[1]?.trim() || null;
}

snapshot.rows = (snapshot.rows || []).map(row => {
  const text = textOf(row.rawResponse);
  const sector = field(text, 'sectorName');
  const industry = field(text, 'industryName');
  return {
    ...row,
    trendlyneSector: sector,
    industry,
    extractionStatus: sector ? 'AVAILABLE' : 'DATA_INSUFFICIENT',
    extractionReason: sector ? null : 'Trendlyne overview did not expose sectorIndustryData.sectorName.',
  };
});
snapshot.reprocessedAt = new Date().toISOString();
fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
const available = snapshot.rows.filter(row => row.extractionStatus === 'AVAILABLE').length;
console.log(JSON.stringify({ output: filePath, reparsed: snapshot.rows.length, sectorAvailable: available, unavailable: snapshot.rows.length - available }));
