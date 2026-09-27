/**
 * Deterministic same-session signal policy shared by historical scanners.
 *
 * One strategy keeps at most one signal for a symbol and trading date.  A
 * signal with an explicit quality/score wins; ties keep the latest evaluated
 * record.  No values are invented: absent quality fields simply rank equally.
 */
export function dedupeSameDaySignals(rows, {
  symbolField = 'Symbol',
  dateField = 'Signal_Date',
  qualityFields = ['match_score', 'quality_score', 'confidence_score', 'confidence_pct'],
} = {}) {
  const best = new Map();
  rows.forEach((row, index) => {
    const symbol = String(row?.[symbolField] ?? row?.symbol ?? '').trim().toUpperCase();
    const date = String(row?.[dateField] ?? row?.signal_date ?? row?.signalDate ?? '').slice(0, 10);
    if (!symbol || !date) return;
    const quality = qualityFields.reduce((value, field) => {
      const n = Number(row?.[field]);
      return Number.isFinite(n) ? Math.max(value, n) : value;
    }, 0);
    const timestamp = String(row?.signal_timestamp ?? row?.signal_time ?? '');
    const candidate = { row, index, quality, timestamp };
    const current = best.get(`${symbol}|${date}`);
    if (!current || candidate.quality > current.quality ||
      (candidate.quality === current.quality && candidate.timestamp > current.timestamp) ||
      (candidate.quality === current.quality && candidate.timestamp === current.timestamp && candidate.index > current.index)) {
      best.set(`${symbol}|${date}`, candidate);
    }
  });
  return [...best.values()].sort((a, b) => a.index - b.index).map(x => x.row);
}
