#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'readiness');
const AGENT_DIR = path.join(REPORTS_DIR, 'agents');

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const orchestratorReport = {
  timestamp: new Date().toISOString(),
  phase: "READINESS_ORCHESTRATION",
  application_ready: false,
  market_data_complete: false,
  market_data_certified: false, // Never automatically true
  production_db_writes: 0,
  agents: [],
  blockers: []
};

if (fs.existsSync(AGENT_DIR)) {
  const agents = fs.readdirSync(AGENT_DIR);
  let totalWrites = 0;
  
  for (const agentFile of agents) {
    if (!agentFile.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, agentFile), 'utf8'));
    orchestratorReport.agents.push({
      id: data.agent_id,
      status: data.status,
      blockers: data.blockers || []
    });
    totalWrites += (data.production_db_writes || 0);
    
    if (data.blockers && data.blockers.length > 0) {
      orchestratorReport.blockers.push(...data.blockers);
    }
  }
  
  orchestratorReport.production_db_writes = totalWrites;
} else {
  orchestratorReport.blockers.push("No agent reports found.");
}

// Check A3 Reports
try {
  const a3 = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'APPLICATION_READINESS_REPORT.json'), 'utf8'));
  orchestratorReport.application_ready = a3.application_ready;
} catch(e) {}

try {
  const gate = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'MARKET_DATA_CERTIFICATION_GATE.json'), 'utf8'));
  if (gate.market_data_recovery_status === 'COMPLETE' && gate.provenance_status === 'PASS') {
    orchestratorReport.market_data_complete = true;
  }
} catch(e) {}

fs.writeFileSync(path.join(REPORTS_DIR, 'OVERALL_PROGRESS.json'), JSON.stringify(orchestratorReport, null, 2));

const md = `# Overall Readiness Progress\n\n**Application Ready**: ${orchestratorReport.application_ready}\n**Market Data Complete**: ${orchestratorReport.market_data_complete}\n**Market Data Certified**: ${orchestratorReport.market_data_certified}\n\n**Production DB Writes**: ${orchestratorReport.production_db_writes}\n\n## Agent Status\n` + orchestratorReport.agents.map(a => `- **${a.id}**: ${a.status} (${a.blockers.length} blockers)`).join('\n') + `\n\n## Blockers\n` + orchestratorReport.blockers.map(b => `- ${b}`).join('\n');

fs.writeFileSync(path.join(REPORTS_DIR, 'OVERALL_PROGRESS.md'), md);
fs.copyFileSync(path.join(REPORTS_DIR, 'OVERALL_PROGRESS.json'), path.join(REPORTS_DIR, 'FINAL_READINESS_PACKAGE.json'));
fs.copyFileSync(path.join(REPORTS_DIR, 'OVERALL_PROGRESS.md'), path.join(REPORTS_DIR, 'FINAL_READINESS_PACKAGE.md'));

console.log("Readiness Orchestrator completed. FINAL_READINESS_PACKAGE generated.");
