import { execFileSync } from "node:child_process";
import fs from "node:fs";

function run(cmd,args){
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd,args,{stdio:"inherit",shell:process.platform==="win32"});
}
if(!fs.existsSync("data/v6.2.0_frozen_manifest.json")){
  run("node",["scripts/fingerprint_v6.2_baseline.mjs"]);
}
run("npx",["vitest","run","tests/unit/point_in_time_data_integrity.test.ts","tests/integration/r1_integrated_fixture.test.ts","--reporter=verbose"]);
console.log("\nR1 PIT TESTS COMPLETE. Full repository type-check must still be run separately.");
