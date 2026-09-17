import fs from "node:fs";
import crypto from "node:crypto";

const lock=JSON.parse(fs.readFileSync("data/R1_LOCKBOX_POLICY.json","utf8"));
if(!lock.performanceOutputsPermitted)
  throw new Error("E2E BLOCKED: R1 lockbox has not been explicitly opened after PIT validation.");

const required=[
 "data/v6.2.0_frozen_manifest.json",
 "src/server/services/research/PointInTimeDataEngine.ts",
 "src/server/services/research/ExecutionSimulator.ts",
 "src/server/services/research/WalkForwardResearchEngine.ts"
];
for(const p of required) if(!fs.existsSync(p)) throw new Error(`Missing research component: ${p}`);

const runId=`V63-${Date.now()}`;
const manifest={
 runId,parentBaseline:"v6.2.0-FROZEN",milestone:"v6.3.0",
 mode:"RESEARCH_ONLY",createdAt:new Date().toISOString(),
 requiredArms:["A_RAW","B_V62_OVERLAY","C_CHALLENGERS","D_RISK_ORACLE"],
 cumulativeAblation:true,leaveOneLayerOut:true,
 costSensitivity:[0.75,1,1.25,1.5,2],
 noProductionMutation:true
};
manifest.hash=crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
fs.writeFileSync(`data/${runId}_manifest.json`,JSON.stringify(manifest,null,2));
console.log(`Created research manifest ${runId}.`);
console.log("Wire repository signal adapters to this harness, then execute the walk-forward run.");
