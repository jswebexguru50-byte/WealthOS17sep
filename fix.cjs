const fs = require('fs');
const files = [
  'src/scripts/run_swarm.ts',
  'src/scripts/swarm/agent_b1_nifty50.ts',
  'src/scripts/swarm/agent_b2_nifty500.ts',
  'src/scripts/swarm/agent_b3_sectors.ts',
  'src/scripts/swarm/agent_b4_constituents.ts',
  'src/scripts/swarm/agent_b5_sector_mapping.ts',
  'src/scripts/swarm/agent_b6_intraday15m.ts',
  'src/scripts/swarm/agent_b7_calendar.ts',
  'src/scripts/swarm/agent_b8_corporate_actions.ts'
];
const esmCheck = "import { fileURLToPath } from 'node:url';\nif (process.argv[1] === fileURLToPath(import.meta.url)) {";
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('if (require.main === module) {', esmCheck);
  fs.writeFileSync(file, content);
}
