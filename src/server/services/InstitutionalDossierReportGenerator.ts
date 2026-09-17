import { MasterOpportunityDashboardReport, ConsolidatedOpportunity } from './ConsolidatedOpportunityEngine.js';

export class InstitutionalDossierReportGenerator {
  private static instance: InstitutionalDossierReportGenerator;

  public static getInstance(): InstitutionalDossierReportGenerator {
    if (!InstitutionalDossierReportGenerator.instance) {
      InstitutionalDossierReportGenerator.instance = new InstitutionalDossierReportGenerator();
    }
    return InstitutionalDossierReportGenerator.instance;
  }

  /**
   * Generates an executive publication-grade standalone HTML document
   * suitable for offline sharing, email, or saving as PDF via browser print.
   */
  public generateStandaloneHtmlReport(
    report: MasterOpportunityDashboardReport,
    tier: 'top5' | 'top10' | 'top25' | 'all' = 'top10'
  ): string {
    const genDate = new Date(report.generatedAt).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium'
    });

    let activeOpps: ConsolidatedOpportunity[] = report.opportunities;
    let tierTitle = 'Top 10 Institutional Core Compounders';
    let tierSubtitle = report.rankedTiers?.capacitySummary.top10Message || 'Quality compounders with portfolio-aware sector concentration limits (OPP-3).';

    if (tier === 'top5') {
      activeOpps = report.rankedTiers?.top5AlphaSnipers || report.opportunities.filter(o => o.actionableNow).slice(0, 5);
      tierTitle = 'Top 5 Alpha Snipers — Calibrated Immediate Execution Tier';
      tierSubtitle = report.rankedTiers?.capacitySummary.top5Message || 'High-conviction actionable setups clearing all independent evidence gates.';
    } else if (tier === 'top10') {
      activeOpps = report.rankedTiers?.top10InstitutionalCore || report.opportunities.slice(0, 10);
      tierTitle = 'Top 10 Institutional Core Compounders — Sector-Diversified Portfolio';
      tierSubtitle = report.rankedTiers?.capacitySummary.top10Message || 'Quality compounders with portfolio-aware sector concentration limits (OPP-3).';
    } else if (tier === 'top25') {
      activeOpps = report.rankedTiers?.top25MultiCapRadar.all || report.opportunities.slice(0, 25);
      tierTitle = 'Top 25 Multi-Cap Radar — Balanced Institutional Universe';
      tierSubtitle = report.rankedTiers?.capacitySummary.top25Message || 'Structured across Large, Mid, Small, and Microcap bands.';
    } else {
      activeOpps = report.opportunities;
      tierTitle = 'Full Master Universe Pipeline (750+ Scrips)';
      tierSubtitle = 'Complete quantitative pipeline containing all scanned opportunities across Nifty 500 & Microcap 250.';
    }

    const oppRowsHtml = activeOpps.map((opp, idx) => `
      <div class="scrip-dossier-card" id="scrip-${opp.symbol}">
        <div class="scrip-header">
          <div class="scrip-title-block">
            <span class="scrip-rank">#${idx + 1}</span>
            <h3 class="scrip-symbol">${opp.symbol}</h3>
            <span class="scrip-company">${opp.companyName}</span>
            <span class="scrip-sector">${opp.sector}</span>
          </div>
          <div class="scrip-score-block">
            <div class="score-badge score-${opp.convergenceScore >= 80 ? 'high' : opp.convergenceScore >= 65 ? 'mid' : 'low'}">
              <span class="score-val">${opp.convergenceScore}</span>
              <span class="score-max">/100</span>
            </div>
            <span class="verdict-label">${opp.convictionBadge}</span>
          </div>
        </div>

        <!-- KPI Grid -->
        <div class="kpi-grid">
          <div class="kpi-cell">
            <span class="kpi-lbl">Current Price</span>
            <span class="kpi-val">₹${opp.currentPrice.toLocaleString('en-IN')}</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-lbl">Float Squeeze Ratio</span>
            <span class="kpi-val font-accent">${opp.floatSqueezeRatio}x</span>
            <span class="kpi-sub">${opp.floatRegime.replace(/_/g, ' ')}</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-lbl">ROCE / ROE</span>
            <span class="kpi-val">${opp.rocePct}% / ${opp.roePct}%</span>
            <span class="kpi-sub">${opp.multibaggerTier.replace(/_/g, ' ')}</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-lbl">VPA Stage</span>
            <span class="kpi-val">${opp.vpaStage.replace(/_/g, ' ')}</span>
            <span class="kpi-sub">Up/Down Vol: ${opp.vpaAsymmetryRatio}x</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-lbl">Point Zero (P0) Stop</span>
            <span class="kpi-val text-danger">₹${opp.tranches.pointZeroStopLoss}</span>
            <span class="kpi-sub">Risk: -${opp.tranches.structuralRiskPct}%</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-lbl">Target 1 Upside</span>
            <span class="kpi-val text-success">₹${opp.tranches.target1} (+20%)</span>
            <span class="kpi-sub">R:R Ratio: ${opp.tranches.riskRewardRatio}:1</span>
          </div>
        </div>

        <!-- Evidence-Class Gate Audit Checklist (Phase 1) -->
        ${opp.evidenceChecklist ? `
        <div style="margin: 14px 0; padding: 12px 16px; background: #020617; border: 1px solid #334155; border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 10px; font-weight: bold; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.05em;">
              Phase 1 Independent Evidence-Class Gate Audit
            </span>
            <span style="font-size: 10px; font-family: monospace; color: #94a3b8;">
              ADV: ${opp.adv20DayCr ? '₹' + opp.adv20DayCr + ' Cr' : 'Liquid'}
            </span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 11px; font-family: monospace;">
            <span style="color: ${opp.evidenceChecklist.convictionScorePassed ? '#34d399' : '#f87171'}; font-weight: bold;">
              ${opp.evidenceChecklist.convictionScorePassed ? '✓' : '✗'} Conviction Score (${opp.convergenceScore}/100)
            </span>
            <span style="color: ${opp.evidenceChecklist.momentumLevelPassed ? '#34d399' : '#f87171'};">
              ${opp.evidenceChecklist.momentumLevelPassed ? '✓' : '✗'} Momentum (${opp.evidenceChecklist.momentumClassification.replace(/_/g, ' ')})
            </span>
            <span style="color: ${opp.evidenceChecklist.confluencePassed ? '#34d399' : '#f87171'};">
              ${opp.evidenceChecklist.confluencePassed ? '✓' : '✗'} Confluence R:R (${opp.tranches?.structuralRiskPct}% Risk)
            </span>
            <span style="color: ${opp.evidenceChecklist.smartMoneyAccumulationPassed ? '#34d399' : '#f87171'};">
              ${opp.evidenceChecklist.smartMoneyAccumulationPassed ? '✓' : '✗'} Smart Money (${opp.floatRegime.replace(/_/g, ' ')})
            </span>
            <span style="color: ${opp.evidenceChecklist.liquidityGatePassed ? '#34d399' : '#f87171'};">
              ${opp.evidenceChecklist.liquidityGatePassed ? '✓' : '✗'} Liquidity Gate (${opp.evidenceChecklist.advMetric})
            </span>
            <span style="color: ${opp.evidenceChecklist.sectorConcentrationPassed ? '#34d399' : '#fbbf24'};">
              ${opp.evidenceChecklist.sectorConcentrationPassed ? '✓ Sector Diversified' : '⚠ ' + (opp.evidenceChecklist.sectorWarning || 'Sector Limit Exceeded')}
            </span>
          </div>
          ${opp.evidenceChecklist.failedGates && opp.evidenceChecklist.failedGates.length > 0 ? `
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #1e293b; font-size: 10px; color: #f87171;">
            <strong>Gate Audit Notes:</strong> ${opp.evidenceChecklist.failedGates.join(' • ')}
          </div>` : ''}
        </div>` : ''}

        <!-- Selection Catalyst & Strategic Moat -->
        ${opp.selectionCatalyst ? `
        <div style="margin: 16px 0; padding: 16px; background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px;">
          <div style="font-size: 11px; font-weight: bold; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px;">Institutional Selection Catalyst & Moat</div>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #f1f5f9; line-height: 1.5;">${opp.selectionCatalyst}</p>
          ${opp.moatDescription ? `<p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4;"><strong>Moat Architecture:</strong> ${opp.moatDescription}</p>` : ''}
          ${opp.orderBookOrRevenueVisibility ? `<p style="margin: 6px 0 0 0; font-size: 11px; color: #34d399; font-weight: bold;">Order Visibility: ${opp.orderBookOrRevenueVisibility}</p>` : ''}
        </div>` : ''}

        <!-- 360° Consolidated Score Compilation Formula -->
        ${opp.scoreBreakdown ? `
        <div style="margin: 16px 0; padding: 16px; background: #0f172a; border: 1px solid #334155; border-radius: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: bold; color: #38bdf8; text-transform: uppercase;">360° Consolidated Score Compilation Formula</span>
            <span style="font-size: 12px; font-weight: bold; color: #f8fafc; font-family: monospace;">Overall Score: ${opp.convergenceScore}/100</span>
          </div>
          <div style="font-size: 12px; font-family: monospace; color: #cbd5e1; margin-bottom: 12px; padding: 8px 12px; background: #020617; border-radius: 8px;">
            <strong>${opp.convergenceScore}/100</strong> = <span style="color: #34d399;">(Fundamentals ${opp.scoreBreakdown.fundamentalScore} × 30%)</span> + <span style="color: #38bdf8;">(Technicals ${opp.scoreBreakdown.technicalScore} × 25%)</span> + <span style="color: #60a5fa;">(Smart Money ${opp.scoreBreakdown.smartMoneyScore} × 20%)</span> + <span style="color: #fbbf24;">(Sentiment ${opp.scoreBreakdown.sentimentScore} × 15%)</span> + <span style="color: #c084fc;">(Derivatives ${opp.scoreBreakdown.derivativeScore} × 10%)</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; text-align: center; font-size: 11px; font-family: monospace;">
            <div style="padding: 8px; background: #1e293b; border-radius: 8px;"><span style="color: #94a3b8; display: block; font-size: 9px;">1. FUNDAMENTALS</span><strong style="color: #34d399; font-size: 14px;">${opp.scoreBreakdown.fundamentalScore}/100</strong><span style="color: #64748b; display: block; font-size: 9px;">30% Weight</span></div>
            <div style="padding: 8px; background: #1e293b; border-radius: 8px;"><span style="color: #94a3b8; display: block; font-size: 9px;">2. TECHNICALS</span><strong style="color: #38bdf8; font-size: 14px;">${opp.scoreBreakdown.technicalScore}/100</strong><span style="color: #64748b; display: block; font-size: 9px;">25% Weight</span></div>
            <div style="padding: 8px; background: #1e293b; border-radius: 8px;"><span style="color: #94a3b8; display: block; font-size: 9px;">3. SMART MONEY</span><strong style="color: #60a5fa; font-size: 14px;">${opp.scoreBreakdown.smartMoneyScore}/100</strong><span style="color: #64748b; display: block; font-size: 9px;">20% Weight</span></div>
            <div style="padding: 8px; background: #1e293b; border-radius: 8px;"><span style="color: #94a3b8; display: block; font-size: 9px;">4. SENTIMENT</span><strong style="color: #fbbf24; font-size: 14px;">${opp.scoreBreakdown.sentimentScore}/100</strong><span style="color: #64748b; display: block; font-size: 9px;">15% Weight</span></div>
            <div style="padding: 8px; background: #1e293b; border-radius: 8px;"><span style="color: #94a3b8; display: block; font-size: 9px;">5. DERIVATIVES</span><strong style="color: #c084fc; font-size: 14px;">${opp.scoreBreakdown.derivativeScore}/100</strong><span style="color: #64748b; display: block; font-size: 9px;">10% Weight</span></div>
          </div>
        </div>` : ''}

        <!-- Technical Confluence: Fibonacci, Bollinger Bands & RSI -->
        ${(opp.fibonacciAnalysis || opp.bollingerAnalysis || opp.rsiAnalysis || opp.optionChainAnalysis) ? `
        <div style="margin: 16px 0; padding: 16px; background: #0f172a; border: 1px solid #334155; border-radius: 12px;">
          <div style="font-size: 11px; font-weight: bold; color: #38bdf8; text-transform: uppercase; margin-bottom: 12px;">Technical Confluence, Fibonacci & Derivatives Geometry</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 11px; font-family: monospace;">
            ${opp.fibonacciAnalysis ? `
            <div style="padding: 12px; background: #1e293b; border-radius: 8px; line-height: 1.6;">
              <strong style="color: #fbbf24; display: block; margin-bottom: 4px;">Fibonacci Retracement Grid</strong>
              <div>0.382 Floor: ₹${opp.fibonacciAnalysis.fib382}</div>
              <div>0.500 Midpoint: ₹${opp.fibonacciAnalysis.fib500}</div>
              <div style="color: #fbbf24; font-weight: bold;">0.618 Golden Pocket: ₹${opp.fibonacciAnalysis.fib618}</div>
              <div>1.272 Ext: ₹${opp.fibonacciAnalysis.ext1272}</div>
              <span style="color: #94a3b8; font-size: 10px; display: block; margin-top: 4px;">Zone: ${opp.fibonacciAnalysis.goldenPocketStatus}</span>
            </div>` : ''}

            ${opp.bollingerAnalysis ? `
            <div style="padding: 12px; background: #1e293b; border-radius: 8px; line-height: 1.6;">
              <strong style="color: #38bdf8; display: block; margin-bottom: 4px;">Bollinger Bands (20 SMA, 2σ)</strong>
              <div>Upper (+2σ): ₹${opp.bollingerAnalysis.upper}</div>
              <div>20 SMA Mid: ₹${opp.bollingerAnalysis.middle}</div>
              <div>Lower (-2σ): ₹${opp.bollingerAnalysis.lower}</div>
              <div>Bandwidth: <strong>${opp.bollingerAnalysis.bandwidthPct}%</strong> (${opp.bollingerAnalysis.isSqueezing ? '🔥 Squeeze' : 'Normal'})</div>
            </div>` : ''}

            ${opp.rsiAnalysis ? `
            <div style="padding: 12px; background: #1e293b; border-radius: 8px; line-height: 1.6;">
              <strong style="color: #34d399; display: block; margin-bottom: 4px;">RSI (14-Period) Momentum</strong>
              <div>RSI-14: <strong style="font-size: 14px; color: #34d399;">${opp.rsiAnalysis.rsi14}</strong></div>
              <div>Regime: <strong>${opp.rsiAnalysis.regime}</strong></div>
              <div>Divergence: ${opp.rsiAnalysis.divergence}</div>
            </div>` : ''}

            ${opp.optionChainAnalysis ? `
            <div style="padding: 12px; background: #1e293b; border-radius: 8px; line-height: 1.6;">
              <strong style="color: #c084fc; display: block; margin-bottom: 4px;">Option Chain Positioning</strong>
              <div>Max Pain Strike: <strong style="color: #38bdf8;">₹${opp.optionChainAnalysis.maxPainStrike}</strong></div>
              <div>Put-Call Ratio (PCR): <strong style="color: #34d399;">${opp.optionChainAnalysis.pcrOi}</strong></div>
              <div>Call Wall / Put Floor: ₹${opp.optionChainAnalysis.callResistanceStrike} / ₹${opp.optionChainAnalysis.putSupportStrike}</div>
              <div>ATM IV: ${opp.optionChainAnalysis.atmIv}% (${opp.optionChainAnalysis.derivativeBias})</div>
            </div>` : ''}
          </div>
        </div>` : ''}

        <!-- Dual-Axis: Bull Case vs Bear Case -->
        ${(opp.bullCaseThesis && opp.bearCaseRisks) ? `
        <div style="margin: 16px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="padding: 14px; background: rgba(5, 150, 105, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px;">
            <div style="font-size: 11px; font-weight: bold; color: #34d399; text-transform: uppercase; margin-bottom: 8px;">The Bull Case — Why It Is A Good Opportunity</div>
            <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #f1f5f9; line-height: 1.6;">
              ${opp.bullCaseThesis.map(b => `<li>${b}</li>`).join('')}
            </ul>
          </div>
          <div style="padding: 14px; background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 12px;">
            <div style="font-size: 11px; font-weight: bold; color: #fb7185; text-transform: uppercase; margin-bottom: 8px;">The Bear Case — Vulnerabilities & Forensic Red Flags</div>
            <ul style="margin: 0; padding-left: 16px; font-size: 11px; color: #f1f5f9; line-height: 1.6;">
              ${opp.bearCaseRisks.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>` : ''}

        <!-- 6 Forensic Pillars Deep-Dive -->
        <div class="pillars-container">
          <!-- Pillar 1: Macro & Sector -->
          <div class="pillar-box">
            <h4 class="pillar-title">1. Macro & Sector Relative Strength</h4>
            <p class="pillar-desc">
              <strong>Macro Posture:</strong> ${opp.macroRegime.replace(/_/g, ' ')} (${report.macroTelemetry.statusSummary}).
              <br />
              <strong>Sector Alpha:</strong> ${opp.sector} demonstrates +${opp.sectorRelativeStrengthAlpha}% alpha relative to Nifty 500, ranking as <em>${opp.sectorTrend}</em> in institutional rotation matrices.
            </p>
          </div>

          <!-- Pillar 2: Smart Money Float -->
          <div class="pillar-box">
            <h4 class="pillar-title">2. Smart Money Shareholding & Float Lock</h4>
            <div class="table-mini-wrap">
              <table class="table-mini">
                <tr><th>Promoter Holding</th><td>${opp.promoterHoldingPct}%</td></tr>
                <tr><th>FII Holding</th><td>${opp.fiiHoldingPct}%</td></tr>
                <tr><th>DII Holding</th><td>${opp.diiHoldingPct}%</td></tr>
                <tr><th>Combined Institutional Float</th><td>${(opp.fiiHoldingPct + opp.diiHoldingPct).toFixed(1)}%</td></tr>
                <tr><th>Retail Floating Supply</th><td><strong>${opp.retailFloatPct}%</strong> (Tight Lock)</td></tr>
                <tr><th>Float Squeeze Ratio</th><td><strong>${opp.floatSqueezeRatio}x</strong> of non-promoter float locked</td></tr>
              </table>
            </div>
          </div>

          <!-- Pillar 3: Fundamental & Multibagger Moat -->
          <div class="pillar-box">
            <h4 class="pillar-title">3. Fundamental Moat & QGLP Compounding</h4>
            <div class="table-mini-wrap">
              <table class="table-mini">
                <tr><th>ROCE / ROE</th><td><strong>${opp.rocePct}%</strong> / ${opp.roePct}%</td></tr>
                <tr><th>Debt / Equity</th><td>${opp.debtToEquity}x (Solvent Balance Sheet)</td></tr>
                <tr><th>CFO / PAT Ratio</th><td>${opp.cfoToPatRatio}x (Realized Operating Cash)</td></tr>
                <tr><th>Reinvestment Rate</th><td>${opp.reinvestmentRatePct}% (Self-funding compounding engine)</td></tr>
                <tr><th>P/E vs PEG</th><td>${opp.peRatio}x / <strong>${opp.pegRatio} PEG</strong></td></tr>
                <tr><th>Market Capitalization</th><td>₹${opp.marketCapCr.toLocaleString('en-IN')} Cr</td></tr>
              </table>
            </div>
          </div>

          <!-- Pillar 4 & 5: VPA & Tranche Geometry -->
          <div class="pillar-box">
            <h4 class="pillar-title">4 & 5. Volume Price Analysis (VPA) & 3-Tranche Geometry</h4>
            <p class="pillar-desc">
              Base duration holding upper 50% quadrant with <strong>${opp.vpaAsymmetryRatio}x</strong> up-day volume asymmetry.
              ATR contraction ratio is <strong>${opp.atrContractionRatio}</strong>, indicating imminent institutional volatility expansion.
            </p>
            <div class="tranche-table-wrap">
              <table class="tranche-table">
                <thead>
                  <tr>
                    <th>Tranche Order</th>
                    <th>Allocation</th>
                    <th>Execution Trigger Price</th>
                    <th>Rationale & Condition</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Tranche 1</strong></td>
                    <td>33% (1/3rd)</td>
                    <td class="font-accent">₹${opp.tranches.tranche1Price}</td>
                    <td>Base support accumulation floor (P0 upper boundary)</td>
                  </tr>
                  <tr>
                    <td><strong>Tranche 2</strong></td>
                    <td>33% (1/3rd)</td>
                    <td class="font-accent">₹${opp.tranches.tranche2Price}</td>
                    <td>Mid-base equilibrium confirmation with volume tick</td>
                  </tr>
                  <tr>
                    <td><strong>Tranche 3</strong></td>
                    <td>34% (1/3rd)</td>
                    <td class="font-accent">₹${opp.tranches.tranche3Price}</td>
                    <td>High-volume breakout pivot confirmation</td>
                  </tr>
                  <tr class="tranche-highlight">
                    <td><strong>Blended VWAP</strong></td>
                    <td>100%</td>
                    <td><strong>₹${opp.tranches.blendedVwap}</strong></td>
                    <td>Half-Kelly sizing position anchor</td>
                  </tr>
                  <tr class="tranche-danger">
                    <td><strong>Point Zero Stop (P0)</strong></td>
                    <td>Exit 100%</td>
                    <td><strong>₹${opp.tranches.pointZeroStopLoss}</strong></td>
                    <td>Structural base invalidation floor (-${opp.tranches.structuralRiskPct}%)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Verbatim Multi-Pillar Rationale -->
        <div class="rationale-box">
          <h4 class="rationale-title">Forensic Institutional Thesis & Funnel Survival Proof</h4>
          <ul class="rationale-list">
            ${opp.integratedRationale.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      </div>
    `).join('');

    const switchesHtml = report.rebalanceSwitches.map(sw => {
      const sourceSym = (sw as any).sourceSymbol || sw.sourceLaggard?.symbol || 'UNKNOWN';
      const sourceName = (sw as any).sourceHoldingName || sw.sourceLaggard?.companyName || '';
      const sourcePort = (sw as any).sourcePortfolio || sw.sourceLaggard?.portfolio || 'CORE';
      const freedCap = (sw as any).freedCapitalInr ?? sw.financialMetrics?.capitalFreedInr ?? sw.sourceLaggard?.capitalFreedInr ?? 0;
      const drawdown = (sw as any).drawdownPct ?? Math.abs(sw.sourceLaggard?.unrealizedPnlPct ?? 0);
      const harvestedLoss = (sw as any).harvestedLossInr ?? Math.abs(sw.sourceLaggard?.currentUnrealizedPnlInr ?? 0);
      const taxShield = (sw as any).taxShieldBenefitInr ?? sw.financialMetrics?.taxLossHarvestSavingsInr ?? 0;

      const targetSym = (sw as any).targetSymbol || sw.destinationOpportunity?.symbol || 'UNKNOWN';
      const targetName = (sw as any).targetCompanyName || sw.destinationOpportunity?.companyName || '';
      const targetScore = (sw as any).targetConvergenceScore ?? 85;
      const targetRoce = (sw as any).targetRocePct ?? 25;
      const targetFloatSqueeze = (sw as any).targetFloatSqueezeRatio ?? 2.5;
      const targetTrancheEntry = (sw as any).targetTrancheEntryPrice ?? sw.destinationOpportunity?.currentPrice ?? 0;
      const targetTrancheT1 = (sw as any).targetTrancheTarget1 ?? sw.destinationOpportunity?.target1Price ?? 0;
      const rationale = (sw as any).rebalanceRationale || sw.switchRationale || sw.financialMetrics?.taxShieldExplanation || 'Optimizing capital deployment into higher-conviction compounder';

      return `
      <div class="switch-card">
        <div class="switch-flow">
          <div class="switch-exit">
            <span class="tag tag-danger">SELL / EXIT (Laggard)</span>
            <h4>${sourceSym}</h4>
            <span class="sub">${sourceName} (${sourcePort})</span>
            <div class="switch-stat">Capital Freed: <strong>₹${freedCap.toLocaleString('en-IN')}</strong></div>
            <div class="switch-stat">Drawdown: <strong class="text-danger">${drawdown}%</strong></div>
            <div class="switch-stat">Harvested Tax Loss: <strong>₹${harvestedLoss.toLocaleString('en-IN')}</strong></div>
            <div class="switch-stat text-success">Tax Shield Benefit: <strong>₹${taxShield.toLocaleString('en-IN')}</strong></div>
          </div>
          <div class="switch-arrow">➔</div>
          <div class="switch-entry">
            <span class="tag tag-success">BUY / ACCUMULATE (Pipeline Star)</span>
            <h4>${targetSym}</h4>
            <span class="sub">${targetName} • Score ${targetScore}/100</span>
            <div class="switch-stat">ROCE Moat: <strong>${targetRoce}%</strong></div>
            <div class="switch-stat">Float Squeeze: <strong>${targetFloatSqueeze}x</strong></div>
            <div class="switch-stat">Tranche Entry: <strong>₹${targetTrancheEntry}</strong></div>
            <div class="switch-stat text-success">Target 1 (+20%): <strong>₹${targetTrancheT1}</strong></div>
          </div>
        </div>
        <div class="switch-rationale">
          <strong>Switch Rationale:</strong> ${rationale}
        </div>
      </div>
    `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NRI WealthOS — Institutional Opportunity Engine Research Dossier</title>
  <style>
    :root {
      --bg-main: #090d16;
      --bg-card: #0f172a;
      --bg-inner: #1e293b;
      --border-color: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-cyan: #06b6d4;
      --accent-blue: #3b82f6;
      --accent-gold: #f59e0b;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --font-mono: 'JetBrains Mono', 'Courier New', monospace;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-main);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.6;
      padding: 30px;
    }

    .dossier-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Print styling */
    @media print {
      body {
        background-color: #ffffff !important;
        color: #0f172a !important;
        padding: 0 !important;
        font-size: 12px !important;
      }
      .no-print { display: none !important; }
      .scrip-dossier-card {
        page-break-inside: avoid;
        border: 1px solid #cbd5e1 !important;
        background: #f8fafc !important;
        color: #0f172a !important;
        margin-bottom: 20px !important;
      }
      .kpi-cell, .pillar-box, .rationale-box {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #0f172a !important;
      }
      .kpi-val, .scrip-symbol, h1, h2, h3, h4 {
        color: #0f172a !important;
      }
      .table-mini th, .tranche-table th {
        background: #f1f5f9 !important;
        color: #0f172a !important;
      }
      .table-mini td, .tranche-table td {
        border-color: #e2e8f0 !important;
        color: #0f172a !important;
      }
    }

    /* Header Bar */
    .dossier-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      color: var(--accent-cyan);
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .meta-block {
      text-align: right;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Executive Actions */
    .action-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 30px;
    }
    .btn {
      padding: 10px 18px;
      border-radius: 10px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid var(--border-color);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
      color: #090d16;
      border: none;
    }
    .btn-secondary {
      background: var(--bg-card);
      color: var(--text-main);
    }

    /* Section Headings */
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-left: 4px solid var(--accent-cyan);
      padding-left: 12px;
    }

    /* Macro Telemetry Banner */
    .macro-banner {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
    }
    .macro-stat-label {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      display: block;
    }
    .macro-stat-val {
      font-size: 20px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: #ffffff;
      margin-top: 4px;
      display: block;
    }
    .badge-regime {
      background: rgba(6, 182, 212, 0.15);
      border: 1px solid var(--accent-cyan);
      color: var(--accent-cyan);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      font-family: var(--font-mono);
      display: inline-block;
    }

    /* Scrip Dossier Cards */
    .scrip-dossier-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 30px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .scrip-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .scrip-title-block {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .scrip-rank {
      background: var(--bg-inner);
      color: var(--accent-cyan);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 800;
      padding: 6px 12px;
      border-radius: 8px;
    }
    .scrip-symbol {
      font-size: 24px;
      font-weight: 800;
      font-family: var(--font-mono);
      color: #ffffff;
    }
    .scrip-company {
      font-size: 14px;
      color: var(--text-muted);
    }
    .scrip-sector {
      background: rgba(255,255,255,0.06);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }
    .scrip-score-block {
      text-align: right;
    }
    .score-badge {
      display: inline-flex;
      align-items: baseline;
      gap: 2px;
      font-family: var(--font-mono);
      padding: 4px 12px;
      border-radius: 8px;
      margin-bottom: 4px;
    }
    .score-high { background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }
    .score-mid { background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); }
    .score-val { font-size: 20px; font-weight: 800; }
    .score-max { font-size: 12px; opacity: 0.8; }
    .verdict-label {
      display: block;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .kpi-cell {
      background: var(--bg-inner);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 12px 16px;
    }
    .kpi-lbl {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      text-transform: uppercase;
      display: block;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #ffffff;
      margin-top: 2px;
      display: block;
    }
    .kpi-sub {
      font-size: 10px;
      color: var(--text-muted);
      display: block;
      margin-top: 2px;
    }

    /* Pillars */
    .pillars-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 800px) {
      .pillars-container { grid-template-columns: 1fr; }
    }
    .pillar-box {
      background: var(--bg-inner);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 14px;
      padding: 16px;
    }
    .pillar-title {
      font-size: 12px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 6px;
    }
    .pillar-desc {
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.6;
    }

    /* Tables */
    .table-mini-wrap, .tranche-table-wrap {
      overflow-x: auto;
    }
    .table-mini, .tranche-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      font-family: var(--font-mono);
    }
    .table-mini th, .table-mini td, .tranche-table th, .tranche-table td {
      padding: 6px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      text-align: left;
    }
    .table-mini th { color: var(--text-muted); width: 60%; }
    .table-mini td { color: #ffffff; text-align: right; }
    .tranche-table th { background: rgba(0,0,0,0.2); color: var(--text-muted); }
    .tranche-highlight { background: rgba(6, 182, 212, 0.1); font-weight: 700; }
    .tranche-danger { background: rgba(239, 68, 68, 0.1); color: var(--accent-red); font-weight: 700; }

    /* Rationale */
    .rationale-box {
      background: rgba(6, 182, 212, 0.05);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 14px;
      padding: 16px 20px;
    }
    .rationale-title {
      font-size: 12px;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--accent-cyan);
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .rationale-list {
      list-style-type: none;
      padding-left: 0;
    }
    .rationale-list li {
      font-size: 12px;
      color: #e2e8f0;
      padding: 4px 0;
      display: flex;
      gap: 8px;
    }
    .rationale-list li::before {
      content: '✔';
      color: var(--accent-cyan);
      font-weight: bold;
    }

    /* Switch Card */
    .switch-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .switch-flow {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 20px;
      align-items: center;
    }
    .switch-arrow {
      font-size: 28px;
      color: var(--accent-cyan);
      text-align: center;
    }
    .switch-exit, .switch-entry {
      background: var(--bg-inner);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.05);
    }
    .tag {
      font-size: 9px;
      font-family: var(--font-mono);
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 8px;
    }
    .tag-danger { background: rgba(239,68,68,0.2); color: var(--accent-red); border: 1px solid var(--accent-red); }
    .tag-success { background: rgba(16,185,129,0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }
    .switch-stat {
      font-size: 11px;
      font-family: var(--font-mono);
      margin-top: 4px;
      color: var(--text-muted);
    }
    .switch-rationale {
      margin-top: 12px;
      font-size: 12px;
      color: #cbd5e1;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }

    .font-accent { color: var(--accent-cyan); }
    .text-success { color: var(--accent-green); }
    .text-danger { color: var(--accent-red); }
  </style>
</head>
<body>
  <div class="dossier-container">
    <!-- Header -->
    <header class="dossier-header">
      <div>
        <h1 class="brand-title">NRI WealthOS</h1>
        <div class="brand-sub">${tierTitle}</div>
        <div style="font-size: 11px; color: var(--accent-cyan); margin-top: 4px; font-family: var(--font-mono);">${tierSubtitle}</div>
      </div>
      <div class="meta-block">
        <div>Generated: <strong>${genDate}</strong></div>
        <div>Active Tier: <strong>${tier.toUpperCase()}</strong> (${activeOpps.length} Candidates)</div>
        <div>Policy: <strong>Calibrated Evidence Gates • Zero-Mock Compliance</strong></div>
      </div>
    </header>

    <!-- Quick Action Bar & Tier Navigation -->
    <div class="action-bar no-print" style="flex-direction: column; align-items: stretch; gap: 12px;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a href="/api/opportunity-engine/export-dossier?format=html&tier=top5" class="btn ${tier === 'top5' ? 'btn-primary' : 'btn-secondary'}">
          ⚡ Top 5 Alpha Snipers (${report.rankedTiers?.capacitySummary.top5Count || activeOpps.length}/5)
        </a>
        <a href="/api/opportunity-engine/export-dossier?format=html&tier=top10" class="btn ${tier === 'top10' ? 'btn-primary' : 'btn-secondary'}">
          🚀 Top 10 Institutional Core (${report.rankedTiers?.capacitySummary.top10Count || activeOpps.length}/10)
        </a>
        <a href="/api/opportunity-engine/export-dossier?format=html&tier=top25" class="btn ${tier === 'top25' ? 'btn-primary' : 'btn-secondary'}">
          🎯 Top 25 Multi-Cap Radar (${report.rankedTiers?.capacitySummary.top25Count || activeOpps.length}/25)
        </a>
        <a href="/api/opportunity-engine/export-dossier?format=html&tier=all" class="btn ${tier === 'all' ? 'btn-primary' : 'btn-secondary'}">
          📊 Full Universe (${report.opportunities.length})
        </a>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button onclick="window.print()" class="btn btn-primary">
          🖨️ Print / Save as PDF
        </button>
        <a href="/api/opportunity-engine/export-dossier?format=markdown&tier=${tier}" download="Opportunity_Engine_Dossier_${tier}.md" class="btn btn-secondary">
          📄 Download Markdown (.md)
        </a>
        <a href="/api/consensus/export-excel" download class="btn btn-secondary">
          📊 Export Commercial Excel (.xlsx)
        </a>
      </div>
    </div>

    <!-- Macro Telemetry -->
    <section>
      <h2 class="section-title">Macro Market Posture & Regime Telemetry</h2>
      <div class="macro-banner">
        <div>
          <span class="macro-stat-label">Market Posture</span>
          <span class="macro-stat-val">
            <span class="badge-regime">${report.macroTelemetry.regime.replace(/_/g, ' ')}</span>
          </span>
          <span style="font-size: 11px; color: var(--text-muted); margin-top: 6px; display: block;">
            ${report.macroTelemetry.statusSummary}
          </span>
        </div>
        <div>
          <span class="macro-stat-label">Benchmark Index (Nifty 500)</span>
          <span class="macro-stat-val">₹${report.macroTelemetry.benchmarkClose.toLocaleString('en-IN')}</span>
          <span style="font-size: 11px; color: var(--text-muted);">
            50-DMA: ₹${report.macroTelemetry.sma50} | 200-DMA: ₹${report.macroTelemetry.sma200}
          </span>
        </div>
        <div>
          <span class="macro-stat-label">India VIX (Fear Gauge)</span>
          <span class="macro-stat-val font-accent">${report.macroTelemetry.indiaVix}</span>
          <span style="font-size: 11px; color: var(--accent-green);">
            ${report.macroTelemetry.vixRegime.replace(/_/g, ' ')} Regime
          </span>
        </div>
        <div>
          <span class="macro-stat-label">Leading Rotation Sector</span>
          <span class="macro-stat-val" style="color: var(--accent-gold); font-size: 16px;">
            ${report.macroTelemetry.leadingSector}
          </span>
          <span style="font-size: 11px; color: var(--text-muted);">
            Relative Strength Alpha Leader
          </span>
        </div>
      </div>
    </section>

    <!-- Funnel Gate Summary -->
    <section style="margin-bottom: 30px;">
      <h2 class="section-title">The 6-Stage Quantitative Convergence Funnel</h2>
      <div class="macro-banner" style="grid-template-columns: repeat(6, 1fr);">
        <div style="text-align: center;">
          <span class="macro-stat-label">1. Universe Scanned</span>
          <span class="macro-stat-val">${report.funnelSummary.universeScannedCount}</span>
        </div>
        <div style="text-align: center;">
          <span class="macro-stat-label">2. Smart Money Locked</span>
          <span class="macro-stat-val font-accent">${report.funnelSummary.smartMoneyQualifiedCount}</span>
        </div>
        <div style="text-align: center;">
          <span class="macro-stat-label">3. QGLP Moat Passed</span>
          <span class="macro-stat-val text-success">${report.funnelSummary.fundamentalGatePassedCount}</span>
        </div>
        <div style="text-align: center;">
          <span class="macro-stat-label">4. VPA Ready</span>
          <span class="macro-stat-val" style="color: var(--accent-gold);">${report.funnelSummary.vpaActionableCount}</span>
        </div>
        <div style="text-align: center;">
          <span class="macro-stat-label">5. Triple Convergence</span>
          <span class="macro-stat-val font-accent">${report.funnelSummary.tripleConvergenceCount}</span>
        </div>
        <div style="text-align: center;">
          <span class="macro-stat-label">6. Auto Paper Staged</span>
          <span class="macro-stat-val text-success">${report.funnelSummary.automatedPaperExecutedCount}</span>
        </div>
      </div>
    </section>

    <!-- Scrip-by-Scrip Detailed Forensic Dossiers -->
    <section>
      <h2 class="section-title">Forensic Scrip Dossiers & Institutional Blueprints (${report.opportunities.length} Selected Opportunities)</h2>
      ${oppRowsHtml}
    </section>

    <!-- Paired Switches & Tax Alpha -->
    <section>
      <h2 class="section-title">Paired Capital Rebalancing & Tax-Loss Harvesting Switches</h2>
      ${switchesHtml || '<p style="color: var(--text-muted); font-style: italic; margin-bottom: 20px;">No severe portfolio laggards requiring tax-loss harvesting were detected. All equity holdings operating within normal variance.</p>'}
    </section>

    <!-- Self-Healing & Telemetry -->
    <section style="margin-top: 30px; border-top: 1px solid var(--border-color); padding-top: 20px;">
      <h2 class="section-title">Autonomous Self-Healing Learning Loop & Audit Telemetry</h2>
      <div class="macro-banner">
        <div>
          <span class="macro-stat-label">Audited Calls</span>
          <span class="macro-stat-val">${report.selfLearningTelemetry.auditedCallsCount}</span>
        </div>
        <div>
          <span class="macro-stat-label">Audited Win Rate</span>
          <span class="macro-stat-val text-success">${report.selfLearningTelemetry.winRatePct}%</span>
        </div>
        <div>
          <span class="macro-stat-label">Profit Factor</span>
          <span class="macro-stat-val font-accent">${report.selfLearningTelemetry.profitFactor}x</span>
        </div>
        <div>
          <span class="macro-stat-label">Expectancy R-Multiple</span>
          <span class="macro-stat-val" style="color: var(--accent-gold);">+${report.selfLearningTelemetry.expectancyRatio} R</span>
        </div>
      </div>
    </section>

    <footer style="margin-top: 50px; text-align: center; border-top: 1px solid var(--border-color); padding-top: 20px; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
      NRI WealthOS • Quantitative Intelligence & Global Wealth OS • Confidential Peer / Expert Review Document
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Generates a GitHub Flavored Markdown document for export/sharing
   */
  public generateMarkdownReport(
    report: MasterOpportunityDashboardReport,
    tier: 'top5' | 'top10' | 'top25' | 'all' = 'top10'
  ): string {
    let activeOpps: ConsolidatedOpportunity[] = report.opportunities;
    let tierTitle = 'Top 10 Institutional Core Compounders';
    let tierSubtitle = report.rankedTiers?.capacitySummary.top10Message || 'Quality compounders with portfolio-aware sector concentration limits (OPP-3).';

    if (tier === 'top5') {
      activeOpps = report.rankedTiers?.top5AlphaSnipers || report.opportunities.filter(o => o.actionableNow).slice(0, 5);
      tierTitle = 'Top 5 Alpha Snipers — Calibrated Immediate Execution Tier';
      tierSubtitle = report.rankedTiers?.capacitySummary.top5Message || 'High-conviction actionable setups clearing all independent evidence gates.';
    } else if (tier === 'top10') {
      activeOpps = report.rankedTiers?.top10InstitutionalCore || report.opportunities.slice(0, 10);
      tierTitle = 'Top 10 Institutional Core Compounders — Sector-Diversified Portfolio';
      tierSubtitle = report.rankedTiers?.capacitySummary.top10Message || 'Quality compounders with portfolio-aware sector concentration limits (OPP-3).';
    } else if (tier === 'top25') {
      activeOpps = report.rankedTiers?.top25MultiCapRadar.all || report.opportunities.slice(0, 25);
      tierTitle = 'Top 25 Multi-Cap Radar — Balanced Institutional Universe';
      tierSubtitle = report.rankedTiers?.capacitySummary.top25Message || 'Structured across Large, Mid, Small, and Microcap bands.';
    } else {
      activeOpps = report.opportunities;
      tierTitle = 'Full Master Universe Pipeline (750+ Scrips)';
      tierSubtitle = 'Complete quantitative pipeline containing all scanned opportunities across Nifty 500 & Microcap 250.';
    }

    let md = `# NRI WealthOS — Institutional Opportunity Engine Research Dossier\n\n`;
    md += `## Tier: ${tierTitle}\n`;
    md += `*Capacity Note:* **${tierSubtitle}**\n\n`;
    md += `*Generated:* **${new Date(report.generatedAt).toUTCString()}** | *Policy:* **100% Real Live Market Data • Zero-Mock Compliance**\n\n`;
    md += `## 1. Macro Market Posture & Regime\n\n`;
    md += `- **Macro Regime:** \`${report.macroTelemetry.regime}\`\n`;
    md += `- **Summary:** ${report.macroTelemetry.statusSummary}\n`;
    md += `- **Nifty 500 Index:** ₹${report.macroTelemetry.benchmarkClose} (50-DMA: ₹${report.macroTelemetry.sma50} | 200-DMA: ₹${report.macroTelemetry.sma200})\n`;
    md += `- **India VIX:** ${report.macroTelemetry.indiaVix} (\`${report.macroTelemetry.vixRegime}\`)\n`;
    md += `- **Leading Sector:** ${report.macroTelemetry.leadingSector}\n\n`;

    md += `## 2. The 6-Stage Quantitative Convergence Funnel\n\n`;
    md += `| Funnel Gate | Scrips Passed |\n|:---|:---:|\n`;
    md += `| 1. Universe Scanned | **${report.funnelSummary.universeScannedCount}** |\n`;
    md += `| 2. Smart Money Float Squeeze | **${report.funnelSummary.smartMoneyQualifiedCount}** |\n`;
    md += `| 3. QGLP Moat Qualified | **${report.funnelSummary.fundamentalGatePassedCount}** |\n`;
    md += `| 4. VPA Actionable Setups | **${report.funnelSummary.vpaActionableCount}** |\n`;
    md += `| 5. Triple Convergence (Score >= 85) | **${report.funnelSummary.tripleConvergenceCount}** |\n`;
    md += `| 6. Automated Paper Simulation Staged | **${report.funnelSummary.automatedPaperExecutedCount}** |\n\n`;

    md += `## 3. Scrip-by-Scrip Forensic Dossiers (${activeOpps.length} Curated Scrips)\n\n`;
    for (const [idx, opp] of activeOpps.entries()) {
      md += `### #${idx + 1} ${opp.symbol} (${opp.companyName}) — Score: ${opp.convergenceScore}/100\n\n`;
      md += `- **Sector:** ${opp.sector} | **CMP:** ₹${opp.currentPrice.toLocaleString('en-IN')}\n`;
      md += `- **Conviction Badge:** ${opp.convictionBadge}\n`;
      if (opp.evidenceChecklist) {
        md += `- **Evidence-Class Gates Audit:**\n`;
        md += `  - Conviction Score: ${opp.evidenceChecklist.convictionGatePassed ? 'PASSED ✓' : 'FAILED ✗'} (${opp.evidenceChecklist.details.convictionScore}/100)\n`;
        md += `  - Momentum Confluence: ${opp.evidenceChecklist.momentumGatePassed ? 'PASSED ✓' : 'FAILED ✗'} (${opp.evidenceChecklist.details.momentumStage})\n`;
        md += `  - Smart Money Accumulation (SMAS): ${opp.evidenceChecklist.smasGatePassed ? 'PASSED ✓' : 'FAILED ✗'} (${opp.evidenceChecklist.details.smasClassification})\n`;
        md += `  - Liquidity ADV Gate (OPP-1): ${opp.evidenceChecklist.liquidityGatePassed ? 'PASSED ✓' : 'FAILED ✗'} (20d ADV: ₹${opp.adv20DayCr || 0} Cr)\n`;
        md += `  - Sector Concentration (OPP-3): ${opp.evidenceChecklist.sectorConcentrationPassed ? 'PASSED ✓' : 'FAILED ✗'} (${opp.evidenceChecklist.details.sectorWeightPct}% portfolio sector weight)\n`;
        md += `  - Broker Consensus: ${opp.evidenceChecklist.brokerConsensusPassed ? 'CONVERGENT ✓' : 'DIVERGENT ✗'}\n`;
      }
      md += `- **Smart Money Float:** ${opp.promoterHoldingPct}% Promoter | ${opp.fiiHoldingPct}% FII | ${opp.diiHoldingPct}% DII | **Float Squeeze Ratio:** ${opp.floatSqueezeRatio}x (\`${opp.floatRegime}\`)\n`;
      md += `- **QGLP Fundamental Moat:** ROCE ${opp.rocePct}% | ROE ${opp.roePct}% | D/E ${opp.debtToEquity}x | CFO/PAT ${opp.cfoToPatRatio}x | PEG ${opp.pegRatio} (\`${opp.multibaggerTier}\`)\n`;
      md += `- **VPA Technical Stage:** \`${opp.vpaStage}\` (Up/Down Vol: ${opp.vpaAsymmetryRatio}x, ATR Contraction: ${opp.atrContractionRatio})\n`;
      md += `- **3-Tranche Geometry:**\n`;
      md += `  - Tranche 1 (33%): ₹${opp.tranches.tranche1Price}\n`;
      md += `  - Tranche 2 (33%): ₹${opp.tranches.tranche2Price}\n`;
      md += `  - Tranche 3 (34%): ₹${opp.tranches.tranche3Price}\n`;
      md += `  - Blended VWAP: ₹${opp.tranches.blendedVwap}\n`;
      md += `  - Point Zero Stop Loss (P0): **₹${opp.tranches.pointZeroStopLoss}** (-${opp.tranches.structuralRiskPct}% structural risk)\n`;
      md += `  - Target 1 (+20%): ₹${opp.tranches.target1} | Target 2: ₹${opp.tranches.target2} | R:R Ratio: ${opp.tranches.riskRewardRatio}:1\n\n`;
      md += `**Forensic Thesis:**\n`;
      for (const r of opp.integratedRationale) {
        md += `- ${r}\n`;
      }
      md += `\n---\n\n`;
    }

    if (report.rebalanceSwitches.length > 0) {
      md += `## 4. Paired Capital Rebalancing & Tax-Loss Harvesting Switches\n\n`;
      for (const sw of report.rebalanceSwitches) {
        const sourceSym = (sw as any).sourceSymbol || sw.sourceLaggard?.symbol || 'UNKNOWN';
        const freedCap = (sw as any).freedCapitalInr ?? sw.financialMetrics?.capitalFreedInr ?? sw.sourceLaggard?.capitalFreedInr ?? 0;
        const drawdown = (sw as any).drawdownPct ?? Math.abs(sw.sourceLaggard?.unrealizedPnlPct ?? 0);
        const harvestedLoss = (sw as any).harvestedLossInr ?? Math.abs(sw.sourceLaggard?.currentUnrealizedPnlInr ?? 0);
        const taxShield = (sw as any).taxShieldBenefitInr ?? sw.financialMetrics?.taxLossHarvestSavingsInr ?? 0;

        const targetSym = (sw as any).targetSymbol || sw.destinationOpportunity?.symbol || 'UNKNOWN';
        const targetScore = (sw as any).targetConvergenceScore ?? 85;
        const targetRoce = (sw as any).targetRocePct ?? 25;
        const targetFloatSqueeze = (sw as any).targetFloatSqueezeRatio ?? 2.5;
        const targetTrancheEntry = (sw as any).targetTrancheEntryPrice ?? sw.destinationOpportunity?.currentPrice ?? 0;
        const targetTrancheT1 = (sw as any).targetTrancheTarget1 ?? sw.destinationOpportunity?.target1Price ?? 0;
        const rationale = (sw as any).rebalanceRationale || sw.switchRationale || sw.financialMetrics?.taxShieldExplanation || 'Optimizing capital deployment into higher-conviction compounder';

        md += `### Switch: ${sourceSym} ➔ ${targetSym}\n`;
        md += `- **Exit Laggard:** ${sourceSym} (Drawdown: ${drawdown}%, Freed Capital: ₹${freedCap.toLocaleString('en-IN')}, Harvested Tax Loss: ₹${harvestedLoss.toLocaleString('en-IN')}, Tax Shield Benefit: ₹${taxShield.toLocaleString('en-IN')})\n`;
        md += `- **Enter Pipeline Star:** ${targetSym} (Score: ${targetScore}/100, ROCE: ${targetRoce}%, Float Squeeze: ${targetFloatSqueeze}x, Tranche Entry: ₹${targetTrancheEntry}, Target 1: ₹${targetTrancheT1})\n`;
        md += `- **Rationale:** ${rationale}\n\n`;
      }
    }

    md += `## 5. Self-Healing Telemetry\n\n`;
    md += `- **Audited Win Rate:** ${report.selfLearningTelemetry.winRatePct}%\n`;
    md += `- **Profit Factor:** ${report.selfLearningTelemetry.profitFactor}x\n`;
    md += `- **Expectancy Ratio:** +${report.selfLearningTelemetry.expectancyRatio} R\n`;

    return md;
  }
}
