import { CompanyIntelligenceOrchestrator } from '../../src/server/services/intelligence/CompanyIntelligenceOrchestrator.js';
import { FundamentalExperienceBuilder } from '../../src/server/services/intelligence/modules/FundamentalExperienceBuilder.js';
import { RecentAccumulationEngine } from '../../src/server/services/intelligence/modules/RecentAccumulationEngine.js';

async function main() {
  console.log('Evaluating RVTH end-to-end with canonical Fundamental Experience Builder...');

  const orch = CompanyIntelligenceOrchestrator.getInstance();
  const intel = await orch.getCompanyIntelligence('RVTH');

  const exp = await FundamentalExperienceBuilder.getInstance().buildExperience('RVTH');
  const acc = await RecentAccumulationEngine.getInstance().evaluate('RVTH');

  console.log('\n================== RVTH EVALUATION REPORT ==================');
  console.log('SYMBOL:', exp.symbol);
  console.log('COMPANY NAME:', exp.companyName);
  console.log('SECTOR / INDUSTRY:', exp.sector, '/', exp.industry);
  console.log('BUSINESS MODEL:', exp.businessModel);
  console.log('DATA CONFIDENCE:', exp.dataConfidence);
  console.log('\n--- EXECUTIVE BRIEF (Word count: ' + exp.executiveBrief.wordCount + ') ---');
  console.log(exp.executiveBrief.text);

  console.log('\n--- QGLP FOUR SEPARATE DIMENSIONS ---');
  console.log('QUALITY:', exp.qglp.quality.status);
  console.log('  Summary:', exp.qglp.quality.summary);
  console.log('  Evidence:', exp.qglp.quality.evidenceList.map(e => `${e.parameter}: ${e.value} (${e.status})`));
  console.log('  Missing:', exp.qglp.quality.missingInputs);

  console.log('GROWTH:', exp.qglp.growth.status);
  console.log('  Summary:', exp.qglp.growth.summary);
  console.log('  Evidence:', exp.qglp.growth.evidenceList.map(e => `${e.parameter}: ${e.value} (${e.status})`));
  console.log('  Missing:', exp.qglp.growth.missingInputs);

  console.log('LONGEVITY:', exp.qglp.longevity.status);
  console.log('  Summary:', exp.qglp.longevity.summary);
  console.log('  Evidence:', exp.qglp.longevity.evidenceList.map(e => `${e.parameter}: ${e.value} (${e.status})`));
  console.log('  Missing:', exp.qglp.longevity.missingInputs);

  console.log('PRICE:', exp.qglp.price.status);
  console.log('  Summary:', exp.qglp.price.summary);
  console.log('  Evidence:', exp.qglp.price.evidenceList.map(e => `${e.parameter}: ${e.value} (${e.status})`));
  console.log('  Missing:', exp.qglp.price.missingInputs);

  console.log('\n--- OWNERSHIP ---');
  console.log('Latest Disclosed Period:', exp.ownershipTrend.latestDisclosedPeriod);
  console.log('Promoter %:', exp.ownershipTrend.promoterPct.value);
  console.log('Pledge %:', exp.ownershipTrend.promoterPledgePct.value);
  console.log('FII %:', exp.ownershipTrend.fiiPct.value);
  console.log('DII %:', exp.ownershipTrend.diiPct.value);

  console.log('\n--- RECENT ACCUMULATION / SMART MONEY ENGINE ---');
  console.log('Classification:', acc.classification);
  console.log('Rationale:', acc.classificationRationale);
  console.log('Latest Ownership Date:', acc.latestOwnershipDate);
  console.log('Analysis Window:', acc.analysisStartDate, 'to', acc.analysisEndDate, '(' + acc.totalSessions + ' sessions)');
  console.log('Up Volume vs Down Volume:', acc.upVolumeVsDownVolume);
  console.log('Abnormal Volume Days:', acc.abnormalVolumeDays.length);
  console.log('Delivery Trend:', acc.deliveryEvidence.trend, 'Avg Delivery %:', acc.deliveryEvidence.avgDeliveryPct);
  console.log('Named Buyers:', acc.namedBuyers);
  console.log('Named Sellers:', acc.namedSellers);
  console.log('Historical Disclosed Deals:', acc.historicalDisclosedDeals.length);

  console.log('\n--- UNRESOLVED CONFLICTS ---');
  console.log(JSON.stringify(exp.unresolvedConflicts, null, 2));

  console.log('\n--- WHAT TO WATCH (<= 6 items) ---');
  exp.whatToWatch.forEach((w, idx) => console.log(`${idx + 1}. ${w.item} (Status: ${w.currentStatus}, Priority: ${w.priority})`));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
