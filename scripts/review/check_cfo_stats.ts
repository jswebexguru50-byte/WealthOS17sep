import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });
const cfSnaps = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'cash-flow' LIMIT 100").all() as any[];

let posCfo = 0, negCfo = 0;
const negCfoSyms: string[] = [];
const posCfoSyms: string[] = [];

for (const c of cfSnaps) {
  try {
    const json = JSON.parse(c.response_json);
    const hist = json.data?.operating?.history;
    if (Array.isArray(hist) && hist.length > 0) {
      const val = Number(hist[0]?.value);
      if (!isNaN(val)) {
        if (val > 0) {
          posCfo++;
          posCfoSyms.push(c.symbol);
        } else if (val < 0) {
          negCfo++;
          negCfoSyms.push(c.symbol);
        }
      }
    }
  } catch {}
}

console.log(`From 100 sample cash flows: Pos CFO: ${posCfo}, Neg CFO: ${negCfo}`);
console.log('Sample Neg CFO symbols:', negCfoSyms.slice(0, 10));
