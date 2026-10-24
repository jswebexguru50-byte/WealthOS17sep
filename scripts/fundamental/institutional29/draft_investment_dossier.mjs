#!/usr/bin/env node
/**
 * draft_investment_dossier.mjs — Chat-LLM handoff for the investment dossier
 *
 * Reads evidence_bundle.json and produces a 3000–5000 word formal dossier.
 * ALL numbers come from the evidence bundle. The LLM only produces prose.
 *
 * Usage:
 *   node draft_investment_dossier.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]
 *
 * Input:  outputs/institutional29/<SYMBOL>/evidence_bundle.json
 * Output: reports/fundamental/<SYMBOL>_investment_dossier_<asOf>_chat_handoff.md
 *         reports/fundamental/<SYMBOL>_dossier_meta_<asOf>.json
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── CLI ──────────────────────────────────────────────────────────────────────
const cliArgs = process.argv.slice(2);
const symbol = cliArgs.find(a => !a.startsWith('--'))?.toUpperCase();
if (!symbol) throw new Error('Usage: node draft_investment_dossier.mjs SYMBOL [--as-of YYYY-MM-DD] [--dry-run]');

const asOfIdx = cliArgs.indexOf('--as-of');
const asOf = asOfIdx >= 0 ? cliArgs[asOfIdx + 1] : new Date().toISOString().slice(0, 10);
const DRY_RUN = cliArgs.includes('--dry-run');


// ─── Paths ────────────────────────────────────────────────────────────────────
const root = process.cwd();
const bundlePath = path.resolve(root, 'outputs', 'institutional29', symbol, 'evidence_bundle.json');
const researchBundlePath = path.resolve(root, 'outputs', 'institutional29', symbol, 'research_bundle.json');
const answersOutDir = path.resolve(root, 'outputs', 'institutional29', symbol);
const answersOutPath = path.resolve(answersOutDir, `dossier_answers_${asOf}.md`);
const reportsDir = path.resolve(root, 'reports', 'fundamental');
const outMd   = path.resolve(reportsDir, `${symbol}_investment_dossier_${asOf}_chat_handoff.md`);
const outMeta = path.resolve(reportsDir, `${symbol}_dossier_meta_${asOf}.json`);

if (!fs.existsSync(bundlePath)) {
  throw new Error(`evidence_bundle.json not found: ${bundlePath}\nRun build_unified_evidence.mjs first.`);
}

const b = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

// Load research questions (text + id + topic) from research_bundle.json if available
let researchQuestions = [];
if (fs.existsSync(researchBundlePath)) {
  try {
    const rb = JSON.parse(fs.readFileSync(researchBundlePath, 'utf8'));
    researchQuestions = (rb.questions || []).map(q => ({ id: q.id, topic: q.topic, question: q.question }));
  } catch { /* ignore parse errors */ }
}
// Fallback: derive minimal question list from questionEvidence keys if research_bundle is missing
if (!researchQuestions.length && b.questionEvidence) {
  researchQuestions = Object.entries(b.questionEvidence).map(([id, ev]) => ({
    id: Number(id), topic: ev.topic || `Question ${id}`, question: ev.question || `(Question ${id} text unavailable)`,
  })).sort((a, b) => a.id - b.id);
}
const f = b.financials ?? {};
const sh = b.shareholding ?? {};
const tech = b.technicals ?? {};
const gov = b.governance ?? {};
const qe = b.questionEvidence ?? {};

// ─── Format helpers ───────────────────────────────────────────────────────────
const cr = (v) => v != null ? `₹${Number(v).toFixed(0)} Cr` : 'N/A';
const pct = (v) => v != null ? `${Number(v).toFixed(1)}%` : 'N/A';
const x = (v) => v != null ? Number(v).toFixed(1) + 'x' : 'N/A';
const num = (v, dp = 2) => v != null ? Number(v).toFixed(dp) : 'N/A';

// ─── Build quarterly table ────────────────────────────────────────────────────
function buildQuarterlyTable(rows) {
  if (!rows?.length) return '_No quarterly data available._';
  const header = '| Period | Revenue (₹Cr) | PAT (₹Cr) | OPM% |';
  const sep    = '|--------|--------------|-----------|------|';
  const lines = rows.map(r =>
    `| ${r.period ?? 'N/A'} | ${num(r.revenue_cr, 0)} | ${num(r.pat_cr, 0)} | ${num(r.opm_pct, 1)} |`
  );
  return [header, sep, ...lines].join('\n');
}

// ─── Build annual table ───────────────────────────────────────────────────────
function buildAnnualTable(rows) {
  if (!rows?.length) return '_No annual data available._';
  const header = '| FY | Revenue (₹Cr) | OPM% | PAT (₹Cr) | CFO (₹Cr) | CapEx (₹Cr) |';
  const sep    = '|----|--------------|------|-----------|-----------|-------------|';
  const lines = rows.map(r =>
    `| ${r.fy ?? 'N/A'} | ${num(r.revenue_cr, 0)} | ${num(r.opm_pct, 1)} | ${num(r.pat_cr, 0)} | ${num(r.cfo_cr, 0)} | ${num(r.capex_cr, 0)} |`
  );
  return [header, sep, ...lines].join('\n');
}

// ─── Gather document excerpts ─────────────────────────────────────────────────
function latestDocExcerpt(sectionKey, maxChars = 600) {
  const docs = b.documents ? [] : [];
  // Pull from questionEvidence documents array
  for (const qid of [9, 2, 11, 22]) {
    const qdocs = qe[qid]?.documents ?? [];
    for (const doc of qdocs) {
      const text = doc.sections?.[sectionKey];
      if (text?.length > 20) return text.slice(0, maxChars) + (text.length > maxChars ? '…' : '');
    }
  }
  return null;
}

// ─── Collect gaps across all questions ───────────────────────────────────────
function allGaps() {
  const gaps = [];
  for (const [qid, ev] of Object.entries(qe)) {
    if (ev.gaps?.length) gaps.push(`Q${qid} (${ev.topic}): ${ev.gaps.join('; ')}`);
  }
  return gaps;
}

// ─── Build the evidence payload for the LLM prompt ───────────────────────────
function buildEvidenceSection() {
  const mgmtComm = latestDocExcerpt('managementCommentary') ?? latestDocExcerpt('concallHighlights') ?? 'Not available in evidence bundle.';
  const riskText = latestDocExcerpt('riskFactors') ?? 'Not available in evidence bundle.';
  const auditText = gov.auditOpinion?.slice(0, 400) ?? 'Not available.';
  const gaps = allGaps();

  const sh_hist = (sh.history ?? []).slice(0, 6).map(h =>
    `${h.period ?? '?'}: Promoter ${num(h.promoter, 1)}%, FII ${num(h.fii, 1)}%, DII ${num(h.dii, 1)}%, Pledge ${num(h.pledge, 1)}%`
  ).join('\n');

  return `
## COMPANY IDENTITY
Name: ${b.companyName ?? symbol}
Symbol: ${b.symbol}
BSE Code: ${b.bseCode ?? 'N/A'}
CIN: ${b.cin ?? 'N/A'}
As of: ${b.asOf}

## KEY FINANCIALS (flat summary)
Revenue TTM: ${cr(f.revenueTTM_cr)}
PAT TTM: ${cr(f.patTTM_cr)}
CFO (Annual): ${cr(f.cfoAnnual_cr)}
ROE: ${pct(f.roe_pct)}
ROCE: ${pct(f.roce_pct)}
P/E TTM: ${x(f.pe_ttm)}
P/B Ratio: ${x(f.pb_ratio)}
Market Cap: ${cr(f.mcap_cr)}
Debt/Equity: ${x(f.debtToEquity)}
Interest Coverage: ${x(f.interestCoverage)}
Inventory Days: ${num(f.inventoryDays, 0)} days
Receivable Days: ${num(f.receivableDays, 0)} days
OPM: ${pct(f.opm_pct)}

## ANNUAL FINANCIAL TABLE (last 5 years)
${buildAnnualTable(f.annualRevenue)}

## QUARTERLY FINANCIAL TABLE (last 8 quarters)
${buildQuarterlyTable(f.quarterlyRevenue)}

## SHAREHOLDING (latest)
Promoter: ${pct(sh.promoter_pct)}
FII: ${pct(sh.fii_pct)}
DII: ${pct(sh.dii_pct)}
Public: ${pct(sh.public_pct)}
Promoter Pledge: ${pct(sh.promoter_pledge_pct)}

## SHAREHOLDING HISTORY (last 6 quarters)
${sh_hist || 'No history available.'}

## TECHNICALS
LTP: ₹${num(tech.ltp, 2)}
RSI: ${num(tech.rsi, 1)}
MFI: ${num(tech.mfi, 1)}
SMA20: ₹${num(tech.sma20, 2)} | SMA50: ₹${num(tech.sma50, 2)} | SMA200: ₹${num(tech.sma200, 2)}
Pivot: ₹${num(tech.pivot, 2)} | R1: ₹${num(tech.r1, 2)} | S1: ₹${num(tech.s1, 2)}
52W High: ₹${num(tech.high52w, 2)} | 52W Low: ₹${num(tech.low52w, 2)}
Return 1M: ${pct(tech.changeP_1m)} | 1Y: ${pct(tech.changeP_1yr)} | 3Y: ${pct(tech.changeP_3yr)} | 5Y: ${pct(tech.changeP_5yr)}
DVM Durability: ${num(tech.dvmDurability, 0)} | Valuation: ${num(tech.dvmValuation, 0)} | Momentum: ${num(tech.dvmMomentum, 0)}

## GOVERNANCE
Directors: ${(gov.directors ?? []).map(d => d.name ?? d).join(', ') || 'Not available'}
Auditor opinion excerpt: ${auditText}
${gov.auditQualification ? `AUDIT QUALIFICATION NOTED: ${gov.auditQualification.slice(0, 300)}` : 'No audit qualification found.'}

## MANAGEMENT COMMENTARY (latest)
${mgmtComm}

## KEY RISKS (from documents)
${riskText}

## NEWS (most recent 10 items)
${(b.questionEvidence?.[9]?.news ?? []).concat(b.questionEvidence?.[1]?.news ?? []).slice(0, 10).map(item =>
  `- [${item.date ?? '?'}] ${item.headline ?? item.description ?? JSON.stringify(item).slice(0, 120)}`
).join('\n') || 'No news available.'}

## DATA GAPS (must be disclosed in dossier)
${gaps.length ? gaps.map(g => `- ${g}`).join('\n') : 'No critical gaps identified.'}
`.trim();
}

// ─── LLM callers ─────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const model = process.env.INSTITUTIONAL29_GROQ_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an evidence-bounded institutional equity research analyst. Never invent facts, citations or calculations absent from the supplied evidence bundle. Each answer must be 150-250 words, grounded in the supplied figures.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 8192,
      temperature: 0.1,
    }),
  });
  if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
  const result = await response.json();
  return { text: result.choices[0]?.message?.content || '', model, provider: 'GROQ' };
}

async function callGemini(prompt) {
  const keys = [1,2,3,4,5].map(i => process.env[`GEMINI_API_KEY_${i}`] || process.env.GEMINI_API_KEY).filter(Boolean);
  if (!keys.length) throw new Error('No GEMINI_API_KEY set');
  const apiKey = keys[0];
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  const result = await response.json();
  return { text: result.candidates?.[0]?.content?.parts?.[0]?.text || '', model, provider: 'GEMINI' };
}

// ─── 29-question prompt builder ───────────────────────────────────────────────
function build29QPrompt(evidenceSection) {
  const questionLines = researchQuestions.map(q => `Q${q.id}. [${q.topic}] ${q.question}`).join('\n');
  return `You have the following verified evidence for ${b.companyName ?? symbol} (${symbol}) as of ${b.asOf ?? asOf}:

${evidenceSection}

Now answer each of the following ${researchQuestions.length} research questions. For each question, write a 150-250 word response using ONLY the evidence above. Label each answer clearly as "Q1. [topic]", "Q2. [topic]", etc. If data for a question is absent from the evidence, say so explicitly and state what source would be needed.

${questionLines}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a senior institutional equity analyst writing a formal investment research dossier for a family office.

Rules you must follow without exception:
1. Use ONLY the data provided in the EVIDENCE section below. Never invent numbers, percentages, dates, or facts.
2. Where a metric is N/A or marked as a gap, say so explicitly and name what source would provide it.
3. Write in formal third-person. No first-person language.
4. No buy/sell recommendations. No price targets. State observations and let the evidence speak.
5. Every specific number cited must appear in the EVIDENCE section.
6. Write 3000–5000 words total across all sections.
7. Use Indian financial conventions: ₹ for Rupees, Cr for Crore, FY for financial year (e.g., FY24).
8. Tables must use valid Markdown table syntax.`;

// ─── User prompt ──────────────────────────────────────────────────────────────
function buildUserPrompt(evidenceSection) {
  return `Write a complete investment research dossier for ${b.companyName ?? symbol} (${symbol}) using ONLY the evidence below.

Structure the report exactly as follows:

# ${b.companyName ?? symbol} (${symbol}) — Investment Dossier
**Prepared as of:** ${b.asOf}
**Data sources:** ${[
    b.sources?.trendlyneMCP && 'Trendlyne MCP',
    b.sources?.exchangeAPI && 'BSE/NSE Exchange APIs',
    b.sources?.xbrlFacts && `XBRL (${b.sources.xbrlFacts} facts)`,
    b.sources?.documentsExtracted && `${b.sources.documentsExtracted} documents extracted`,
    b.sources?.mcaData && 'MCA company data',
  ].filter(Boolean).join(' · ')}

---

## Executive Summary (300–400 words)
Key investment thesis in 2–3 sentences. Then: three primary strengths, three principal risks, and an overall stance (constructive / cautious / monitor) with brief rationale. Include: market cap, revenue TTM, PAT TTM, PE, P/B, and 52-week price performance.

## Section 1: Business & Competitive Position (400–600 words)
Describe core products and services, segment contribution to revenue, competitive moat or lack thereof, industry TAM context from documents, and customer/vendor concentration observations.

## Section 2: Financial Performance (500–700 words)
Analyse the 5-year revenue/PAT/CFO trend, margin trajectory, and earnings quality (core vs. one-offs). Discuss Q-on-Q sequential trends using the quarterly table. Reproduce the annual financial table from the EVIDENCE exactly:

${buildAnnualTable(f.annualRevenue)}

## Section 3: Balance Sheet & Capital Efficiency (300–400 words)
Discuss debt levels (net debt/EBITDA, D/E ratio), working capital metrics (inventory days, DSO), ROCE/ROE trajectory, and stated or implied capex plans.

## Section 4: Governance & Shareholding (300–400 words)
Analyse promoter holding trend, pledge levels, insider buying/SAST activity from the evidence. Discuss board composition, auditor identity, any audit qualifications, and related-party transaction exposure.

## Section 5: Valuation & Peer Context (400–500 words)
Assess current P/E, P/B relative to historical context and Trendlyne DVM scores. Discuss what the DVM valuation score implies about relative cheapness or expensiveness. If peer data is absent from the evidence, state this explicitly.

## Section 6: Catalysts & Risks (300–400 words)
List near-term catalysts drawn from news/events/management commentary. List structural risks from the risk factors section. For each risk, state a quantitative watchlist trigger where the evidence permits.

## Section 7: Technical Entry Context (200–300 words)
Describe LTP position relative to SMA20/50/200, RSI and MFI readings, pivot/support/resistance levels, and 52-week context. State a monitoring range if the data supports one.

## Data Completeness Scorecard
Produce this table:

| Data Domain | Status | Source | Gap / Action Needed |
|-------------|--------|--------|---------------------|

Populate one row per domain: Trendlyne MCP, Exchange API, XBRL, Documents, MCA. Mark Status as Complete / Partial / Missing.

---

EVIDENCE:
${evidenceSection}

Write the full dossier now. Do not truncate any section. Adhere to the word ranges.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const evidenceSection = buildEvidenceSection();

console.error(`[draft_investment_dossier] ${symbol} — evidence section: ${evidenceSection.length} chars, questions loaded: ${researchQuestions.length}`);

if (DRY_RUN) {
  console.error(`[draft_investment_dossier] DRY RUN — LLM call and file writes skipped`);
  console.error(`System prompt: ${SYSTEM_PROMPT.length} chars`);
  const q29preview = build29QPrompt(evidenceSection).slice(0, 500);
  console.error(`29Q prompt preview:\n${q29preview}…`);
  console.log(JSON.stringify({ symbol, asOf, dryRun: true, evidenceChars: evidenceSection.length, questionsLoaded: researchQuestions.length }));
  process.exit(0);
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(answersOutDir, { recursive: true });

// Write chat handoff markdown (backward-compat)
const chatPrompt = `# WealthOS chat-LLM dossier handoff\n\n## System instructions\n\n${SYSTEM_PROMPT}\n\n## User request and verified evidence\n\n${buildUserPrompt(evidenceSection)}\n`;
fs.writeFileSync(outMd, chatPrompt, 'utf8');
console.error(`[draft_investment_dossier] Chat handoff written → ${outMd}`);

// ─── Call LLM for 29Q answers ─────────────────────────────────────────────────
const prompt29Q = build29QPrompt(evidenceSection);
let llmResult = null;
let llmError = null;

try {
  console.error(`[draft_investment_dossier] Calling Groq for 29Q answers…`);
  llmResult = await callGroq(prompt29Q);
  console.error(`[draft_investment_dossier] Groq answered (${llmResult.text.length} chars)`);
} catch (err) {
  llmError = `Groq failed: ${err.message}`;
  console.error(`[draft_investment_dossier] ${llmError} — trying Gemini fallback`);
  try {
    llmResult = await callGemini(prompt29Q);
    console.error(`[draft_investment_dossier] Gemini answered (${llmResult.text.length} chars)`);
  } catch (err2) {
    llmError += ` | Gemini failed: ${err2.message}`;
    console.error(`[draft_investment_dossier] Both providers failed: ${llmError}`);
  }
}

// Save answers file
let answersPath = null;
let generationMode = 'CHAT_LLM_HANDOFF';
let llmModel = null;
let llmProvider = null;

if (llmResult?.text) {
  const answersDoc = [
    `# ${b.companyName ?? symbol} (${symbol}) — 29Q Research Answers`,
    `**As of:** ${asOf}  `,
    `**Model:** ${llmResult.model} (${llmResult.provider})  `,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '> Evidence-bounded answers. All numbers sourced from the evidence bundle. Where evidence is absent, this is stated explicitly.',
    '',
    llmResult.text,
  ].join('\n');
  fs.writeFileSync(answersOutPath, answersDoc, 'utf8');
  answersPath = answersOutPath;
  generationMode = 'LLM_ANSWERED';
  llmModel = llmResult.model;
  llmProvider = llmResult.provider;
  console.error(`[draft_investment_dossier] Answers written → ${answersOutPath}`);

  // Also append answers to the handoff markdown
  fs.appendFileSync(outMd, `\n\n---\n\n## LLM-Generated Answers (${llmResult.provider} / ${llmResult.model})\n\n${llmResult.text}\n`, 'utf8');
} else {
  console.error(`[draft_investment_dossier] No LLM output — handoff file only. Error: ${llmError}`);
}

const meta = {
  symbol,
  asOf,
  companyName: b.companyName,
  generationMode,
  model: llmModel,
  provider: llmProvider,
  answersPath,
  wordCount: llmResult?.text ? llmResult.text.split(/\s+/).length : null,
  chatHandoffPath: outMd,
  evidenceChars: evidenceSection.length,
  questionsAnswered: researchQuestions.length,
  llmError: llmError || null,
  sources: b.sources,
  totalGaps: Object.values(b.questionEvidence ?? {}).reduce((acc, e) => acc + (e.gaps?.length ?? 0), 0),
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - t0,
};
fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2), 'utf8');

console.log(JSON.stringify(meta, null, 2));
