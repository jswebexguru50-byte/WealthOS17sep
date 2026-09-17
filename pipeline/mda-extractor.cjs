#!/usr/bin/env node
/**
 * MD&A extractor — Phase 1, the highest-leverage step.
 *
 * Annual-report MD&A text is already inside every long-tail scrip's
 * "statutory" bucket, but per the original audit it never went through
 * real extraction — only balance-sheet ratios did. This script closes
 * that gap using the SAME evidence-required discipline the concall
 * pipeline should already have.
 *
 * Install:
 *   npm install pdf-parse string-similarity
 *
 * TODO before running against production:
 *   - Replace `callLLM()` with your existing Groq/Gemini client wrapper —
 *     this file's version is a minimal reference implementation only.
 *   - Replace the in-memory `writeAssertions()` stub with your real DB
 *     write path — but note it MUST go through quality-gate.cjs first;
 *     see AGENT_CONSTITUTION.md Rule 5.
 *
 * Do not add fields beyond PHASE_1_FIELDS. Do not add trade-geometry or
 * verdict logic here — that's explicitly out of scope for this phase.
 */

const fs = require("fs");
const pdfParse = require("pdf-parse");
const { verifyCitation, verifyAssertionCitation, isHeadingOrBoilerplate } = require("./citation-verifier.cjs");
const { runQualityGate } = require("./quality-gate.cjs");

const METHODOLOGY_VERSION = "mda-extractor-v1.0.0";

// Fixed field list for Phase 1 — see IMPLEMENTATION_PLAN.md. Do not extend
// without updating that file and this constant together.
const PHASE_1_FIELDS = [
  "demandTone",
  "growthDrivers",
  "keyRisks",
  "capexPlans",
  "costPressures",
  "competitivePosition",
  "managementOutlook",
  "segmentPerformance",
];

/** Fetch a PDF and return its raw text. */
async function fetchPdfText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PDF fetch failed (${res.status}) for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const parsed = await pdfParse(buf);
  return { text: parsed.text, pageCount: parsed.numpages };
}

/**
 * Very deliberately naive section isolation: find the MD&A / Directors'
 * Report heading and take a bounded window after it, rather than feeding
 * the whole annual report (often 150+ pages) to the LLM. Replace with a
 * proper section classifier when Phase 2/3 work justifies the investment;
 * for Phase 1 this is enough to keep the extraction grounded and cheap.
 */
function isolateMdaSection(fullText) {
  const headings = [
    /management discussion and analysis/i,
    /directors[’']? report/i,
  ];
  for (const heading of headings) {
    const match = fullText.match(heading);
    if (match) {
      const start = match.index;
      return fullText.slice(start, start + 20000); // ~ a few thousand words
    }
  }
  return null; // heading not found — do not silently extract from the whole doc
}

/**
 * Reference LLM call. Swap for your existing wrapper. Kept deliberately
 * provider-agnostic via an env var so this file doesn't hardcode a vendor.
 */
async function callLLM(prompt) {
  const provider = process.env.LLM_PROVIDER || "groq";

  if (provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

function buildPrompt(sectionText, scripId) {
  return `You are extracting facts from an Indian company's Annual Report
Management Discussion & Analysis / Directors' Report section for scrip ${scripId}.

Extract ONLY the following fields. For each field:
- If the text explicitly supports a value, return it with the EXACT quoted
  span (verbatim, no paraphrasing) that supports it.
- If the text does not explicitly address the field, return null for both
  value and quotedText. DO NOT INFER. DO NOT ESTIMATE. An absent field is a
  correct answer.

Fields: ${PHASE_1_FIELDS.join(", ")}

Return strict JSON, no prose, in this shape:
{
  "demandTone": { "value": string | null, "quotedText": string | null },
  "growthDrivers": { "value": string | null, "quotedText": string | null },
  ... (one entry per field above)
}

SOURCE TEXT:
"""
${sectionText}
"""`;
}

function safeParseJson(raw) {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Turns one LLM field result into a ForensicAssertion-shaped object,
 * running it through citation verification. Confidence is capped per
 * schema/evidence-types.ts CONFIDENCE_CAPS — a single-source LLM
 * extraction never exceeds 0.70, whatever the model itself claims.
 */
function buildAssertion(scripId, field, fieldResult, documentId) {
  // Step 2 Invariant: Heading detection is NOT evidence for operational assertions.
  // The assertion must possess its own substantive supporting span.
  if (
    !fieldResult ||
    fieldResult.value == null ||
    !fieldResult.quotedText ||
    isHeadingOrBoilerplate(fieldResult.quotedText)
  ) {
    return {
      assertionId: `${scripId}:${field}:${Date.now()}`,
      scripId,
      field,
      value: null,
      status: "MISSING",
      evidenceIds: [],
      confidence: null,
      sourceCount: 0,
      extractionMethod: "LLM",
      methodologyVersion: METHODOLOGY_VERSION,
      createdAt: new Date().toISOString(),
      rejectionReason: !fieldResult?.quotedText
        ? "NO_QUOTED_TEXT"
        : "HEADING_OR_BOILERPLATE_ONLY_INSUFFICIENT_EVIDENCE",
    };
  }

  const evidenceId = `${documentId}:${field}`;
  const citationResult = verifyAssertionCitation(field, fieldResult.quotedText, fieldResult._sourceSectionText || "");

  let status = "UNVERIFIED";
  let confidence = 0.70; // LLM_SINGLE_SOURCE cap
  if (citationResult.label === "INSUFFICIENT_EVIDENCE_HEADING_ONLY") {
    return {
      assertionId: `${scripId}:${field}:${Date.now()}`,
      scripId,
      field,
      value: null,
      status: "MISSING",
      evidenceIds: [],
      confidence: null,
      sourceCount: 0,
      extractionMethod: "LLM",
      methodologyVersion: METHODOLOGY_VERSION,
      createdAt: new Date().toISOString(),
      rejectionReason: "HEADING_OR_BOILERPLATE_ONLY_INSUFFICIENT_EVIDENCE",
    };
  } else if (citationResult.label === "MAJOR_MISMATCH" || citationResult.label === "FABRICATED") {
    status = "CONFLICTED";
    confidence = null;
  } else if (citationResult.label === "UNVERIFIABLE") {
    status = "UNVERIFIED";
    confidence = 0.3;
  } else if (citationResult.label === "EXACT" || citationResult.label === "MINOR_MISMATCH") {
    status = "VERIFIED";
    confidence = citationResult.label === "EXACT" ? 0.70 : 0.55;
  }

  return {
    assertionId: `${scripId}:${field}:${Date.now()}`,
    scripId,
    field,
    value: fieldResult.value,
    status,
    evidenceIds: status === "CONFLICTED" ? [] : [evidenceId],
    confidence,
    sourceCount: 1,
    extractionMethod: "LLM",
    methodologyVersion: METHODOLOGY_VERSION,
    createdAt: new Date().toISOString(),
    _citation: citationResult, // for debugging/quarantine review, not for serving schema
  };
}

async function extractMdaForScrip(scripId, annualReportUrl) {
  const { text, pageCount } = await fetchPdfText(annualReportUrl);
  const section = isolateMdaSection(text);

  if (!section) {
    // MD&A heading not found — this is a MISSING result for every field,
    // not silence and not a guess from the full document.
    return PHASE_1_FIELDS.map((field) =>
      buildAssertion(scripId, field, null, null)
    );
  }

  const documentId = `${scripId}:annual_report:${Date.now()}`;
  const raw = await callLLM(buildPrompt(section, scripId));
  const parsed = safeParseJson(raw);

  if (!parsed) {
    // LLM output didn't parse — every field is MISSING, not a partial guess.
    return PHASE_1_FIELDS.map((field) =>
      buildAssertion(scripId, field, null, documentId)
    );
  }

  return PHASE_1_FIELDS.map((field) => {
    const fieldResult = parsed[field];
    if (fieldResult) fieldResult._sourceSectionText = section;
    return buildAssertion(scripId, field, fieldResult, documentId);
  });
}

async function main() {
  const [, , scripId, annualReportUrl] = process.argv;
  if (!scripId || !annualReportUrl) {
    console.error("Usage: node mda-extractor.cjs <scripId> <annualReportUrl>");
    process.exit(1);
  }

  const assertions = await extractMdaForScrip(scripId, annualReportUrl);
  const gated = assertions.map((a) => runQualityGate(a));
  const passed = gated.filter((g) => g.pass);
  const quarantined = gated.filter((g) => !g.pass);

  console.log(`Extraction complete for ${scripId}: ${passed.length} passed quality gate, ${quarantined.length} quarantined.`);

  const path = require("path");
  const sqlite3 = require("sqlite3").verbose();
  const { persistThroughQualityGate } = require("./quality-gate.cjs");
  const DB_PATH = path.resolve(__dirname, "..", "portfolio.db");
  const db = new sqlite3.Database(DB_PATH);

  try {
    const result = await persistThroughQualityGate(db, assertions);
    console.log(`Persisted to DB through Quality Gate: ${result.passedCount} passed, ${result.quarantinedCount} quarantined.`);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { extractMdaForScrip, isolateMdaSection, buildAssertion };
