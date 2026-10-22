import fs from 'node:fs';
import path from 'node:path';

const reportDir = path.resolve('reports', 'readiness', 'vpa_three_leg');
const specs = [
  { key: 'S1a', prefix: 'vpa_three_leg_full_universe_90_' },
  { key: 'S1b', prefix: 's1b_full_universe_90_' },
  { key: 'S2a', prefix: 's2a_full_universe_90_' },
  { key: 'S3a', prefix: 's3a_full_universe_90_' },
  { key: 'S4a', prefix: 's4a_full_universe_90_' },
  { key: 'S4b', prefix: 's4b_full_universe_90_' },
  { key: 'S5a', prefix: 's5a_full_universe_90_' },
];

function sanitizeJson(raw) {
  return raw
    .replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null')
    .replace(/:\s*,/g, ': null,')
    .replace(/:\s*}/g, ': null}');
}

for (const s of specs) {
  const files = fs.readdirSync(reportDir).filter(f => f.startsWith(s.prefix) && f.endsWith('.json')).sort();
  const latest = files[files.length - 1];
  try {
    const raw = fs.readFileSync(path.join(reportDir, latest), 'utf8');
    const sanitized = sanitizeJson(raw);
    const json = JSON.parse(sanitized);
    const dates = (json.matches || []).map(m => m.signal_date || m.Signal_Date || m.as_of_date || m.Data_Last_Date).filter(Boolean);
    dates.sort();
    console.log(`${s.key} (${latest}): matches=${(json.matches || []).length}, minDate=${dates[0]}, maxDate=${dates[dates.length - 1]}, as_of_requested=${json.as_of_date_requested}`);
  } catch (err) {
    console.error(`Error parsing ${s.key} (${latest}):`, err.message);
  }
}
