import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const profiles = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'profile'").all() as any[];

const sectorCounts: Record<string, number> = {};
let large = 0, mid = 0, small = 0, noMcap = 0;

for (const p of profiles) {
  try {
    const json = JSON.parse(p.response_json);
    const sec = json.data?.sector || 'UNKNOWN';
    sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    const mcap = json.data?.sector_market_cap_inr?.value;
    if (typeof mcap === 'number' && !isNaN(mcap)) {
      if (mcap > 20000) large++;
      else if (mcap >= 5000) mid++;
      else small++;
    } else {
      noMcap++;
    }
  } catch {
    //
  }
}

console.log(`Parsed ${profiles.length} profiles.`);
console.log(`Market caps: Large (>20k Cr): ${large}, Mid (5k-20k Cr): ${mid}, Small (<5k Cr): ${small}, No Mcap: ${noMcap}`);
console.log('Top sectors in profile endpoint:');
const sortedSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
console.log(sortedSectors.slice(0, 30));
