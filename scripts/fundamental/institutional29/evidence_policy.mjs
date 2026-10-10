export const EVIDENCE_POLICY_VERSION = 'INSTITUTIONAL29_EVIDENCE_POLICY_V2';

const PRIMARY_SOURCE_TYPES = new Set(['PRIMARY_FILING', 'STATUTORY_FILING', 'EXCHANGE_FILING']);
const VERIFIED_STATES = new Set(['VERIFIED', 'SECONDARY_VERIFIED']);

const timestamp = value => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const explicitPeriod = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

export function factAuthorityScore(fact, preferredScope = 'CONSOLIDATED') {
  let score = 0;
  if (PRIMARY_SOURCE_TYPES.has(String(fact.sourceType || '').toUpperCase())) score += 1000;
  if (String(fact.provider || '').toUpperCase().includes('FERE')) score += 250;
  if (String(fact.verificationStatus || '').toUpperCase() === 'VERIFIED') score += 200;
  else if (VERIFIED_STATES.has(String(fact.verificationStatus || '').toUpperCase())) score += 100;
  if (String(fact.scope || '').toUpperCase() === preferredScope) score += 80;
  else if (String(fact.scope || '').toUpperCase() === 'STANDALONE') score += 50;
  else if (String(fact.scope || '').toUpperCase() === 'SEGMENT') score += 30;
  if (explicitPeriod(fact.periodEnd)) score += 40;
  if (fact.value != null && Number.isFinite(Number(fact.value))) score += 20;
  return score;
}

export function compareFacts(left, right, preferredScope = 'CONSOLIDATED') {
  const authority = factAuthorityScore(right, preferredScope) - factAuthorityScore(left, preferredScope);
  if (authority) return authority;
  const period = timestamp(right.periodEnd || right.asOfDate) - timestamp(left.periodEnd || left.asOfDate);
  if (period) return period;
  return timestamp(right.availableAt || right.fetchedAt || right.publishedAt) - timestamp(left.availableAt || left.fetchedAt || left.publishedAt);
}

export function buildFactIndex(rows, { preferredScope = 'CONSOLIDATED', asOf = null } = {}) {
  const asOfEnd = asOf ? timestamp(`${asOf}T23:59:59.999Z`) : Number.POSITIVE_INFINITY;
  const eligible = rows.filter(row => {
    if (row.value == null || !Number.isFinite(Number(row.value))) return false;
    const available = timestamp(row.availableAt || row.fetchedAt || row.publishedAt);
    return !available || available <= asOfEnd;
  });
  const byMetric = new Map();
  const seen = new Set();
  for (const row of eligible.sort((a, b) => compareFacts(a, b, preferredScope))) {
    const metric = String(row.metric || '').trim();
    if (!metric) continue;
    const key = [metric, row.scope, row.periodType, row.periodEnd, row.value, row.unit, row.provider].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byMetric.has(metric)) byMetric.set(metric, []);
    byMetric.get(metric).push(row);
  }
  return byMetric;
}

export function metricEvidence(factIndex, aliases, limit = 12) {
  return aliases
    .flatMap(alias => factIndex.get(alias) || [])
    .sort((a, b) => compareFacts(a, b))
    .slice(0, limit);
}

export function detectFactConflicts(rows, tolerancePct = 0.25) {
  const groups = new Map();
  for (const row of rows) {
    if (row.value == null || !Number.isFinite(Number(row.value)) || !explicitPeriod(row.periodEnd)) continue;
    const key = [row.metric, row.periodType, row.periodEnd, row.scope || 'UNKNOWN'].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const conflicts = [];
  for (const [key, facts] of groups) {
    const values = [...new Set(facts.map(fact => Number(fact.value)))];
    if (values.length < 2) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const denominator = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    const differencePct = Math.abs(max - min) * 100 / denominator;
    if (differencePct <= tolerancePct) continue;
    conflicts.push({
      key,
      differencePct: Number(differencePct.toFixed(3)),
      facts: facts.map(fact => ({
        factId: fact.factId,
        value: Number(fact.value),
        unit: fact.unit,
        provider: fact.provider,
        sourceType: fact.sourceType,
        verificationStatus: fact.verificationStatus,
      })),
      resolution: 'PREFER_PRIMARY_VERIFIED_FACT_AND_DISCLOSE_CONFLICT',
    });
  }
  return conflicts;
}

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function buildTechnicalDiagnostics(bars) {
  const ordered = [...bars].sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const duplicateDates = ordered.length - new Set(ordered.map(bar => String(bar.trade_date))).size;
  const closes = ordered.map(bar => Number(bar.close_adjusted));
  const invalidBars = closes.filter(value => !Number.isFinite(value) || value <= 0).length;
  const sma = period => closes.length >= period ? average(closes.slice(-period)) : null;
  const close = closes.at(-1) ?? null;
  const sma20 = sma(20);
  const sma50 = sma(50);
  const sma200 = sma(200);
  let maAlignment = 'DATA_INSUFFICIENT';
  if ([close, sma20, sma50, sma200].every(Number.isFinite)) {
    if (close > sma20 && sma20 > sma50 && sma50 > sma200) maAlignment = 'FULL_BULLISH_ALIGNMENT';
    else if (close > sma50 && sma20 < sma50) maAlignment = 'RECENT_RECOVERY_MIXED_ALIGNMENT';
    else if (close > sma20 && close > sma50 && close > sma200) maAlignment = 'PRICE_BULLISH_MA_ORDER_MIXED';
    else maAlignment = 'NON_BULLISH_OR_MIXED_ALIGNMENT';
  }
  return {
    status: ordered.length >= 200 && invalidBars === 0 && duplicateDates === 0 ? 'PASS' : ordered.length >= 50 && invalidBars === 0 && duplicateDates === 0 ? 'PARTIAL_HISTORY' : 'FAIL',
    bars: ordered.length,
    latestDate: ordered.at(-1)?.trade_date || null,
    sourceSet: [...new Set(ordered.map(bar => bar.data_source).filter(Boolean))],
    duplicateDates,
    invalidBars,
    close: Number.isFinite(close) ? Number(close.toFixed(2)) : null,
    sma20: Number.isFinite(sma20) ? Number(sma20.toFixed(2)) : null,
    sma50: Number.isFinite(sma50) ? Number(sma50.toFixed(2)) : null,
    sma200: Number.isFinite(sma200) ? Number(sma200.toFixed(2)) : null,
    prior30Average: closes.length >= 50 ? Number(average(closes.slice(-50, -20)).toFixed(2)) : null,
    maAlignment,
    interpretationRule: 'A shorter SMA below a longer SMA is a mixed trend state, not evidence of bad data. Mark a data error only when bar-integrity checks fail or independent recomputation disagrees.',
  };
}

export const SYNTHESIS_GUARDRAILS = Object.freeze({
  financialScope: 'Every financial amount must carry periodType, periodEnd and scope. Prefer PRIMARY_FILING+VERIFIED+CONSOLIDATED; never relabel UNKNOWN or STANDALONE as CONSOLIDATED.',
  absenceClaims: 'Use “not located in the current evidence bundle” unless the named primary document and all relevant sections were searched. Do not convert missing extraction into company non-disclosure.',
  concentrationClaims: 'A customer/supplier threshold requires an exact excerpt, document, page, period and denominator. Historical prospectus evidence must be labelled HISTORICAL_CONTEXT, not current state.',
  exceptionalItems: 'Report annual and quarterly exceptional items separately with period, scope and economic direction. Never infer gain/charge from sign alone without the statement presentation or note.',
  technicals: 'Recompute indicators from chronologically sorted adjusted OHLCV and emit integrity diagnostics. Unusual moving-average ordering is a market state, not automatically a feed error.',
  conflicts: 'Preserve provider conflicts. Prefer primary verified facts for conclusions and explicitly disclose material differences rather than silently averaging or overwriting.',
});
