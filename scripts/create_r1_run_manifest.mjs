import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const now=new Date();
const runId=`R1-${now.toISOString().replace(/[-:]/g,"").replace(/\..*/,"")}`;

function hashFile(rel) {
  const p=path.join(root,rel);
  if(!fs.existsSync(p)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

const manifestPath=path.join(root,"data","v6.2.0_frozen_manifest.json");
if(!fs.existsSync(manifestPath)) throw new Error("R1 BLOCKED: frozen baseline manifest missing.");

const baseline=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
const run={
  runId,
  milestone:"v6.3.0-R1",
  parentBaseline:"v6.2.0-FROZEN",
  createdAt:now.toISOString(),
  timezone:"Asia/Kolkata",
  eodAvailabilityAnchor:"15:35",
  fundamentalFallbackLagDays:45,
  performanceSimulationPermitted:false,
  dataPolicy:{
    futureReads:"INVALIDATE_RUN",
    missingRequiredData:"FAIL_CLOSED",
    forwardFill:false,
    rawPriceImmutable:true,
    dividendAccounting:"EX_DATE_CASH_OR_TOTAL_RETURN_NOT_BOTH"
  },
  baselineManifestHash:baseline.manifestHash,
  pitEngineHash:hashFile("src/server/services/research/PointInTimeDataEngine.ts"),
  status:"NOT_STARTED"
};

run.runManifestHash=crypto.createHash("sha256")
  .update(JSON.stringify(run)).digest("hex");

const out=path.join(root,"data",`${runId}_research_run_manifest.json`);
fs.writeFileSync(out,JSON.stringify(run,null,2)+"\n",{mode:0o600});
console.log(`Wrote ${out}`);
