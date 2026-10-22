import { Analyze360Service } from '../src/server/services/Analyze360Service.js';
import fs from 'node:fs';

async function capture() {
  const svc = Analyze360Service.getInstance();
  const res = await svc.getAnalyze360View('TCS', undefined, undefined, undefined, undefined, { includeTechnicals: true, includeSectorMomentum: true });
  
  fs.writeFileSync('scripts/tcs_api_response.json', JSON.stringify(res, null, 2));
  console.log('TCS Analyze360 API Response captured.');
  console.log('Top level keys:', Object.keys(res));
  console.log('Company:', res.companyName, '| Sector:', res.sector);
  console.log('\n--- Fundamental Fields Status ---');
  for (const [k, v] of Object.entries(res.fundamental || {})) {
    if (typeof v === 'object' && v !== null && 'status' in v) {
      console.log(`  ${k}: ${(v as any).status} | val: ${(v as any).value} | reason: ${(v as any).missingReason}`);
    } else if (typeof v === 'object' && v !== null) {
      for (const [subK, subV] of Object.entries(v)) {
        if (typeof subV === 'object' && subV !== null && 'status' in subV) {
          console.log(`  ${k}.${subK}: ${(subV as any).status} | val: ${(subV as any).value} | reason: ${(subV as any).missingReason}`);
        }
      }
    }
  }

  console.log('\n--- QGLP Status ---');
  console.log('QGLP Object:', JSON.stringify(res.qglp, null, 2));

  console.log('\n--- Missing Data Checklist ---');
  console.log('Missing items count:', res.missingDataChecklist?.length);
  for (const m of res.missingDataChecklist || []) {
    console.log(`  [${m.severity}] ${m.group} -> ${m.field}: ${m.reason}`);
  }
}

capture().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
