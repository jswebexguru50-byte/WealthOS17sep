/**
 * Read-only Trendlyne period-anchor audit.
 *
 * This script does not call providers and does not mutate SQLite.  It inspects
 * stored Trendlyne MCP payloads and classifies available time context into:
 * - exact dated facts: explicit dates/quarter labels exist in the payload.
 * - anchored inferred candidates: relative labels could be dated only after a
 *   verified annual/quarterly anchor is selected.
 * - relative-only facts: useful history, but not safe for canonical dated
 *   promotion yet.
 */
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

type Row = Record<string, unknown>;

const root = process.cwd();
const dataDir = path.join(root, 'data', 'fundamental_enrichment');
const manifestIndex = process.argv.indexOf('--manifest');
const maxIndex = process.argv.indexOf('--max-symbols');
const manifestPath = manifestIndex >= 0
  ? path.resolve(root, process.argv[manifestIndex + 1])
  : path.join(dataDir, 'full_population_manifest.json');
const maxSymbols = maxIndex >= 0 ? Math.max(0, Number(process.argv[maxIndex + 1])) : 230;
const outputPath = path.join(dataDir, 'trendlyne_period_anchor_audit_230.json');
const reportPath = path.join(dataDir, 'trendlyne_period_anchor_audit_230.md');
const dbPath = (process.env.DATABASE_URL || path.join(root, 'portfolio.db')).replace(/^sqlite:\/\//, '');

const all = (db: sqlite3.Database, sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) =>
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve((rows || []) as Row[])),
);
const close = (db: sqlite3.Database) => new Promise<void>(resolve => db.close(() => resolve()));

const monthNumber: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function readSymbols() {
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const symbols = [...new Set((parsed.symbols || [])
    .map((value: unknown) => String(value).trim().toUpperCase())
    .filter(Boolean))];
  return maxSymbols > 0 ? symbols.slice(0, maxSymbols) : symbols;
}

function textFromResponse(raw: unknown): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed.structuredContent?.result) return String(parsed.structuredContent.result);
    const contentText = Array.isArray(parsed.content)
      ? parsed.content.map((entry: any) => String(entry?.text || '')).join('\n')
      : '';
    return contentText;
  } catch {
    return String(raw);
  }
}

function unwrapProviderData(text: string): string {
  for (const candidate of text.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.endsWith('}'))) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.data === 'string') return parsed.data;
      if (typeof parsed.markdown_data === 'string') return parsed.markdown_data;
    } catch {
      // Continue scanning; Trendlyne text payloads can contain explanatory text.
    }
  }
  return text;
}

function parameterHeaderDates(text: string) {
  const data = unwrapProviderData(text);
  const dates = new Set<string>();
  for (const line of data.split(/\r?\n/)) {
    const fields = line.split('|');
    const maybeDate = fields[4]?.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate || '')) dates.add(maybeDate);
  }
  return [...dates].sort();
}

function relativeMetricLabels(text: string) {
  const data = unwrapProviderData(text);
  const labels = new Set<string>();
  for (const block of data.split(/\n---\n/)) {
    const firstLine = block.trim().split(/\r?\n/)[0]?.trim();
    if (!firstLine) continue;
    if (/\b(\d+\s*(Yr|Q)|Qtr Ago|Yr Ago|Annual \d+Yr|Q Ago)\b/i.test(firstLine)) labels.add(firstLine);
  }
  return [...labels].sort();
}

function quarterEnd(label: string) {
  const match = label.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i);
  if (!match) return null;
  const month = monthNumber[match[1].slice(0, 3).toUpperCase()];
  const year = Number(match[2]);
  if (!month || !year) return null;
  const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
  return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
}

function shareholdingQuarterLabels(text: string) {
  const labels = new Set<string>();
  for (const match of text.matchAll(/\[\\"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\\"/gi)) {
    labels.add(match[0].replace(/^\[\\"/, '').replace(/\\"$/, ''));
  }
  for (const match of text.matchAll(/\["(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}"/gi)) {
    labels.add(match[0].replace(/^\["/, '').replace(/"$/, ''));
  }
  return [...labels].sort().map(label => ({ label, periodEnd: quarterEnd(label) }));
}

function documentAnchors(text: string) {
  const unwrapped = unwrapProviderData(text);
  const anchors: Array<{ documentType: string | null; documentDate: string | null; periodStart: string | null; periodEnd: string | null }> = [];
  const header = unwrapped.match(/\|([^|\n]+)\|(\d{4}-\d{2}-\d{2})/);
  const documentType = header?.[1]?.trim() || null;
  const documentDate = header?.[2] || null;
  const periodMatch = unwrapped.match(/from\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);
  anchors.push({
    documentType,
    documentDate,
    periodStart: periodMatch ? normalizeLongDate(periodMatch[1]) : null,
    periodEnd: periodMatch ? normalizeLongDate(periodMatch[2]) : null,
  });
  return anchors.filter(anchor => anchor.documentType || anchor.documentDate || anchor.periodEnd);
}

function normalizeLongDate(value: string) {
  const parsed = new Date(value.replace(',', ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

async function main() {
  const symbols = readSymbols();
  const placeholders = symbols.map(() => '?').join(',');
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  try {
    const rows = await all(db, `SELECT symbol, endpoint, status, fetched_at, response_json
      FROM fundamental_endpoint_snapshots
      WHERE provider='TRENDLYNE_MCP' AND upper(symbol) IN (${placeholders})
        AND endpoint IN ('parameters','quarterly_profit_history','shareholding','overview','documents')
      ORDER BY symbol, endpoint`, symbols);
    const bySymbol = new Map<string, Row[]>();
    for (const row of rows) {
      const symbol = String(row.symbol).toUpperCase();
      bySymbol.set(symbol, [...(bySymbol.get(symbol) || []), row]);
    }

    const records = symbols.map(symbol => {
      const endpoints = new Map((bySymbol.get(symbol) || []).map(row => [String(row.endpoint), row]));
      const parametersText = textFromResponse(endpoints.get('parameters')?.response_json);
      const quarterlyText = textFromResponse(endpoints.get('quarterly_profit_history')?.response_json);
      const shareholdingText = [
        textFromResponse(endpoints.get('shareholding')?.response_json),
        textFromResponse(endpoints.get('overview')?.response_json),
      ].filter(Boolean).join('\n');
      const documentsText = textFromResponse(endpoints.get('documents')?.response_json);
      const parameterObservationDates = parameterHeaderDates(parametersText);
      const relativeLabels = [...new Set([
        ...relativeMetricLabels(parametersText),
        ...relativeMetricLabels(quarterlyText),
      ])].sort();
      const quarters = shareholdingQuarterLabels(shareholdingText);
      const docs = documentAnchors(documentsText);
      const verifiedAnnualAnchor = docs.find(doc => doc.periodEnd);
      return {
        symbol,
        parameterSnapshot: {
          status: endpoints.get('parameters')?.status || 'SOURCE_UNAVAILABLE',
          fetchedAt: endpoints.get('parameters')?.fetched_at || null,
          observationDates: parameterObservationDates,
          interpretation: parameterObservationDates.length
            ? 'PROVIDER_OBSERVATION_DATE_NOT_FINANCIAL_PERIOD_END'
            : 'NO_PROVIDER_OBSERVATION_DATE',
        },
        exactDatedEvidence: {
          shareholdingQuarters: quarters,
          documentAnchors: docs,
        },
        relativeFinancialHistory: {
          labels: relativeLabels,
          status: relativeLabels.length
            ? (verifiedAnnualAnchor ? 'ANCHOR_AVAILABLE_FOR_REVIEW' : 'RELATIVE_PERIOD_ONLY')
            : 'NOT_CAPTURED',
          anchorCandidate: verifiedAnnualAnchor || null,
        },
      };
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY_NO_PROVIDER_CALLS_NO_DB_WRITES',
      requested: records.length,
      withParameterObservationDate: records.filter(r => r.parameterSnapshot.observationDates.length).length,
      withShareholdingQuarterLabels: records.filter(r => r.exactDatedEvidence.shareholdingQuarters.length).length,
      withDocumentPeriodAnchor: records.filter(r => r.exactDatedEvidence.documentAnchors.some(anchor => anchor.periodEnd)).length,
      withRelativeFinancialHistory: records.filter(r => r.relativeFinancialHistory.labels.length).length,
      anchorableRelativeFinancialHistory: records.filter(r => r.relativeFinancialHistory.status === 'ANCHOR_AVAILABLE_FOR_REVIEW').length,
      policy: [
        'Do not treat provider observation date as fiscal period end.',
        'Shareholding quarter labels can be promoted as exact dated ownership periods.',
        'Relative financial labels can be promoted only after a verified annual or quarterly anchor is selected.',
      ],
      records,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    const md = [
      '# Trendlyne period-anchor audit',
      '',
      `Generated: ${payload.generatedAt}`,
      '',
      `- Symbols reviewed: ${payload.requested}`,
      `- Parameter payloads with provider observation date: ${payload.withParameterObservationDate}`,
      `- Symbols with explicit shareholding quarter labels: ${payload.withShareholdingQuarterLabels}`,
      `- Symbols with document period anchor candidates: ${payload.withDocumentPeriodAnchor}`,
      `- Symbols with relative financial-history labels: ${payload.withRelativeFinancialHistory}`,
      `- Symbols whose relative history may be anchorable after review: ${payload.anchorableRelativeFinancialHistory}`,
      '',
      'Policy:',
      '',
      '- Provider observation date is not a fiscal period end.',
      '- Shareholding quarter labels are exact dated ownership evidence.',
      '- Relative financial labels require a verified anchor before canonical dated promotion.',
      '',
    ].join('\n');
    fs.writeFileSync(reportPath, md);
    console.log(JSON.stringify({
      outputPath,
      reportPath,
      requested: payload.requested,
      withParameterObservationDate: payload.withParameterObservationDate,
      withShareholdingQuarterLabels: payload.withShareholdingQuarterLabels,
      withDocumentPeriodAnchor: payload.withDocumentPeriodAnchor,
      withRelativeFinancialHistory: payload.withRelativeFinancialHistory,
      anchorableRelativeFinancialHistory: payload.anchorableRelativeFinancialHistory,
    }, null, 2));
  } finally {
    await close(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
