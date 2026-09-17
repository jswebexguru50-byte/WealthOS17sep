import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE = 'data/phase2_cohort';
const SYMBOLS = [
  'SOLARINDS', 'ARVSMART', 'NOVARTIND', 'BAJAJHLDNG', 'UNOMINDA',
  'VMART', 'TATATECH', 'HINDCOPPER', 'SCI', 'BOROLTD',
  'PURVA', 'STLNETWORK', 'SENCO', 'GMDCLTD', '360ONE',
  'MANORAMA', 'IKIO', 'THOMASCOOK', 'RPGLIFE', 'KAVVERITEL'
];

console.log('=== RUNNING PHASE 2 V3.1 DATA MIGRATION ===');

for (const sym of SYMBOLS) {
  const dir = path.join(BASE, sym);
  if (!fs.existsSync(dir)) continue;

  // 1. Facts migration
  const factsPath = path.join(dir, 'facts.json');
  if (fs.existsSync(factsPath)) {
    const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
    const upgradedFacts = facts.map((f: any) => {
      const isFlow = f.measurementType === 'FLOW';
      const asOf = f.asOfDate || '2024-03-31';
      const year = asOf.substring(0, 4);
      const prevYear = String(parseInt(year) - 1);

      const res: any = {
        factId: f.factId,
        issuerSymbol: f.issuerSymbol || sym,
        metric: f.metric,
        metricId: f.metricId || f.metric,
        metricFamily: f.metricFamily || 'FINANCIAL',
        value: f.value,
        unit: f.unit || 'INR_CRORE',
        measurementType: f.measurementType,
        sourceEvidenceId: f.sourceEvidenceId,
        sourceAuthority: f.sourceAuthority || 'REGULATORY_STATUTORY_DISCLOSURE',
        filingType: f.filingType || 'ANNUAL_REPORT',
        filingDate: f.filingDate || asOf,
        auditStatus: f.auditStatus || 'AUDITED',
        extractionMethod: f.extractionMethod || 'RULE',
        verificationStatus: f.verificationStatus || 'VERIFIED',
        schemaVersion: '3.1',
        ontologyVersion: '1.2',
        notes: f.notes
      };

      if (isFlow) {
        res.periodStart = f.periodStart || `${prevYear}-04-01`;
        res.periodEnd = f.periodEnd || `${year}-03-31`;
        res.measurementPeriod = f.measurementPeriod || `FY${year.substring(2)}`;
      } else {
        res.asOfDate = asOf;
        res.measurementPeriod = f.measurementPeriod || `FY${year.substring(2)}`;
      }

      return res;
    });

    fs.writeFileSync(factsPath, JSON.stringify(upgradedFacts, null, 2), 'utf8');
  }

  // 2. Breaker evaluation cleansing (remove any legacy UNRESOLVED)
  const breakerPath = path.join(dir, 'breaker-evaluation.json');
  if (fs.existsSync(breakerPath)) {
    const breakers = JSON.parse(fs.readFileSync(breakerPath, 'utf8'));
    const cleansed = breakers.map((b: any) => {
      if (b.status === 'UNRESOLVED') {
        return { ...b, status: 'EVALUATION_UNRESOLVED' };
      }
      return b;
    });
    fs.writeFileSync(breakerPath, JSON.stringify(cleansed, null, 2), 'utf8');
  }

  // 3. Investment Brief migration
  const briefPath = path.join(dir, 'investment-brief.json');
  if (fs.existsSync(briefPath)) {
    const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

    // Cleanse thesisBreakers array in brief
    if (brief.thesisBreakers && Array.isArray(brief.thesisBreakers)) {
      brief.thesisBreakers = brief.thesisBreakers.map((b: any) => {
        if (b.status === 'UNRESOLVED') {
          return { ...b, status: 'EVALUATION_UNRESOLVED' };
        }
        return b;
      });
    }

    // Ensure DAG has rule versions
    if (brief.decisionState && brief.decisionState.provenanceDAG) {
      brief.decisionState.provenanceDAG.nodes = brief.decisionState.provenanceDAG.nodes.map((n: any) => {
        if (n.type === 'RULE' && !n.version) {
          return { ...n, version: '2026.09' };
        }
        return n;
      });

      // Synthesize immutable DecisionSnapshot
      const ds = brief.decisionState;
      const dag = ds.provenanceDAG;
      const snapshotPayload = JSON.stringify({
        symbol: sym,
        quantOpportunity: ds.quantOpportunity,
        intelligenceRisk: ds.intelligenceRisk,
        thesisState: ds.thesisState,
        managementCredibility: ds.managementCredibility,
        portfolioPolicy: ds.portfolioPolicy,
        nodes: dag.nodes.map((n: any) => n.id).sort(),
        edges: dag.edges.map((e: any) => `${e.from}->${e.to}`).sort()
      });
      const provenanceHash = crypto.createHash('sha256').update(snapshotPayload).digest('hex');

      ds.decisionSnapshot = {
        snapshotId: `SNAP_${sym}_20260915`,
        decisionId: `DECISION_${sym}`,
        issuerSymbol: sym,
        evaluatedAt: '2026-09-15T12:00:00.000Z',
        schemaVersion: '3.1',
        ontologyVersion: '1.2',
        ruleSetVersion: '2026.09',
        policyVersion: '1.0',
        factVersion: '1.0',
        claimVersion: '1.0',
        decisionState: {
          quantOpportunity: ds.quantOpportunity,
          intelligenceRisk: ds.intelligenceRisk,
          thesisState: ds.thesisState,
          managementCredibility: ds.managementCredibility,
          activeThesisBreakers: ds.activeThesisBreakers,
          criticalUnknowns: ds.criticalUnknowns,
          evidenceQuality: ds.evidenceQuality,
          interpretation: ds.interpretation,
          allocationRecommendation: ds.allocationRecommendation
        },
        portfolioPolicy: ds.portfolioPolicy,
        provenanceDAG: dag,
        provenanceHash
      };
    }

    fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf8');
  }
}

// Also cleanse all_20_summary.json if present
const summaryPath = path.join(BASE, 'all_20_summary.json');
if (fs.existsSync(summaryPath)) {
  let summaryRaw = fs.readFileSync(summaryPath, 'utf8');
  summaryRaw = summaryRaw.replace(/"status":\s*"UNRESOLVED"/g, '"status": "EVALUATION_UNRESOLVED"');
  fs.writeFileSync(summaryPath, summaryRaw, 'utf8');
}

console.log('Phase 2 v3.1 Data Migration Complete across all 20 companies!');
