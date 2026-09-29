/**
 * run_golden_company_validation.ts — Section 21 & 32 Acceptance Script
 *
 * Runs the WealthOS Company Intelligence pipeline on the five golden companies:
 *   1. RELIANCE
 *   2. TCS
 *   3. HDFCBANK
 *   4. TATAMOTORS
 *   5. TATASTEEL
 *
 * Outputs the 16-point product realization report for each company.
 */

import fs from 'fs';
import path from 'path';
import { CompanyIntelligenceOrchestrator } from '../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';

const GOLDEN_COMPANIES = ['RELIANCE', 'TCS', 'HDFCBANK', 'TATAMOTORS', 'TATASTEEL'];

interface AcceptanceReport {
  symbol: string;
  business: string;
  primaryDrivers: any[];
  currentDriverState: any[];
  fundamentalTrajectory: any;
  managementPromises: number;
  managementDelivery: any;
  whatChanged: any[];
  contradictions: any[];
  valuation: any;
  thesis: any;
  catalysts: any[];
  risks: any[];
  attention: any[];
  questions: any[];
  dataGaps: string[];
  evidenceCount: number;
}

async function runGoldenValidation() {
  console.log('═════════════════════════════════════════════════════════════════════════');
  console.log(' WealthOS Company Intelligence — Golden Company Realization Validation');
  console.log('═════════════════════════════════════════════════════════════════════════\n');

  const orchestrator = CompanyIntelligenceOrchestrator.getInstance();
  const reports: Record<string, AcceptanceReport> = {};

  for (const sym of GOLDEN_COMPANIES) {
    console.log(`Analyzing Golden Company: ${sym}...`);
    const start = Date.now();

    // Read without mutating durable state (options.persist = false)
    const resp = await orchestrator.getCompanyIntelligence(sym, undefined, { persist: false });
    const duration = Date.now() - start;

    const m = resp.modules;
    const business = `${resp.security.companyName || sym} | Model: ${resp.security.businessModel} | Sector: ${resp.security.sector || 'N/A'}`;
    const primaryDrivers = m.businessDrivers?.result?.primaryDrivers || [];
    const currentDriverState = (m.businessDrivers?.result?.drivers || []).map(d => ({
      name: d.name,
      state: d.currentState || 'No data',
      direction: d.direction,
    }));
    const fundamentalTrajectory = m.fundamental?.result?.trajectory || null;
    const commitments = m.management?.result?.commitments || [];
    const managementPromises = commitments.length;
    const managementDelivery = m.management?.result?.deliveryHistory || {
      total: commitments.length,
      achieved: commitments.filter(c => c.status === 'ACHIEVED' || c.status === 'DELIVERED').length,
      missed: commitments.filter(c => c.status === 'MISSED').length,
      pending: commitments.filter(c => c.status === 'PENDING' || c.status === 'NOT_YET_DUE').length,
    };
    const whatChanged = (m.delta?.result?.deltas || []).slice(0, 5);
    const contradictions = m.contradictions?.result?.contradictions || [];
    const valuation = {
      status: m.valuation?.status,
      historical: (m.valuation?.result as any)?.historicalIntelligence || null,
    };
    const thesis = {
      summary: m.thesis?.result?.thesis?.summary || 'N/A',
      pillars: (m.thesis?.result?.pillars || []).map(p => ({
        title: p.title,
        status: p.status,
        explanation: p.explanation,
      })),
      changes: m.thesis?.result?.changes || [],
    };
    const catalysts = m.catalysts?.result?.catalysts || [];
    const risks = m.risks?.result?.risks || [];
    const attention = m.attention?.result?.items || [];
    const questions = m.attention?.result?.questions || [];

    const dataGaps = [
      ...(m.fundamental?.missingRequirements || []),
      ...(m.businessDrivers?.missingRequirements || []),
      ...(m.operatingKpis?.missingRequirements || []),
      ...(m.contradictions?.missingRequirements || []),
    ];

    let totalEvidence = 0;
    Object.values(m).forEach((mod: any) => {
      if (mod?.evidenceRefs) totalEvidence += mod.evidenceRefs.length;
    });

    const report: AcceptanceReport = {
      symbol: sym,
      business,
      primaryDrivers,
      currentDriverState,
      fundamentalTrajectory,
      managementPromises,
      managementDelivery,
      whatChanged,
      contradictions,
      valuation,
      thesis,
      catalysts,
      risks,
      attention,
      questions,
      dataGaps,
      evidenceCount: totalEvidence,
    };

    reports[sym] = report;

    console.log(`✓ ${sym} analyzed in ${duration}ms:`);
    console.log(`  • Model: ${resp.security.businessModel}`);
    console.log(`  • Primary Drivers: ${primaryDrivers.length}`);
    console.log(`  • Operating KPIs: ${m.operatingKpis?.result?.coveredCount ?? 0}/${m.operatingKpis?.result?.totalProfileKpis ?? 0}`);
    console.log(`  • Commitments: ${commitments.length} (Missed: ${managementDelivery.missed ?? 0})`);
    console.log(`  • Contradictions: ${contradictions.length}`);
    console.log(`  • Thesis Pillars: ${thesis.pillars.length} (${thesis.pillars.filter(p => p.status === 'SUPPORTED').length} Supported)`);
    console.log(`  • Catalysts: ${catalysts.length}`);
    console.log(`  • Risks: ${risks.length}`);
    console.log(`  • Attention Items: ${attention.length}`);
    console.log(`  • Questions: ${questions.length}`);
    console.log(`  • Total Evidence Refs: ${totalEvidence}\n`);
  }

  const outPath = path.join(process.cwd(), 'GOLDEN_COMPANY_ACCEPTANCE_REPORT.json');
  fs.writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log(`Accepted report written to: ${outPath}`);
}

runGoldenValidation().catch(console.error);
