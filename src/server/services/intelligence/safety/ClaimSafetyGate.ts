/**
 * ClaimSafetyGate.ts — Constitution Article C2, C3 & Section 22
 *
 * Systematic gatekeeper that audits and sanitizes all assertions before they enter
 * the Thesis, Overview, Attention Items, or Contradictions modules.
 *
 * Reject criteria:
 * 1. support === 'UNSUPPORTED'
 * 2. Inferred motives (e.g. "distrust", "fear", "greed")
 * 3. Manipulation / fraud accusations without formal regulatory adjudication
 * 4. Speculative governance crises (e.g. "management collapse", "crisis")
 * 5. Value judgments / superlatives without defined empirical models ("obviously undervalued", "excellent company")
 * 6. Definitive price predictions ("₹420 will hold")
 */

import {
  IntelligenceAssertion,
  StatementKind,
  AssertionSupport,
} from '../contracts/IntelligenceAssertion.js';

export interface SafetyAuditResult {
  passed: boolean;
  sanitizedAssertion?: IntelligenceAssertion;
  violations: string[];
  originalText: string;
}

export class ClaimSafetyGate {
  private static instance: ClaimSafetyGate;

  // Patterns strictly forbidden in analytical discourse
  private static readonly FORBIDDEN_MOTIVE_PATTERNS = [
    /\b(distrusts?|fears?|loves?|hates?|panicked|desperate)\b/i,
    /\binstitutions distrust/i,
    /\bpromoters? intend to dump/i,
    /\bmanagement is hiding/i,
  ];

  private static readonly FORBIDDEN_MANIPULATION_PATTERNS = [
    /\bmanipulat(ed|ing|ion)\b/i,
    /\boperator(s)? (activity|driven|game)\b/i,
    /\bprice (rigging|fixing)\b/i,
    /\bcircular trading scam\b/i,
    /\bpump and dump\b/i,
  ];

  private static readonly FORBIDDEN_CRISIS_PATTERNS = [
    /\bmanagement (crisis|turmoil|chaos|exodus)\b/i,
    /\bcompany is collapsing\b/i,
    /\bgovernance failure\b/i,
  ];

  private static readonly FORBIDDEN_SUPERLATIVE_PATTERNS = [
    /\bobviously undervalued\b/i,
    /\bscreaming buy\b/i,
    /\bguaranteed (multibagger|returns?)\b/i,
    /\bexcellent company\b/i,
    /\bterrible company\b/i,
    /\bflawless business\b/i,
  ];

  private static readonly FORBIDDEN_PRICE_PREDICTION_PATTERNS = [
    /₹?\d+(\.\d+)? will hold/i,
    /will (surely|definitely) reach ₹?\d+/i,
    /target price of ₹?\d+ is guaranteed/i,
    /cannot fall below ₹?\d+/i,
  ];

  private constructor() {}

  public static getInstance(): ClaimSafetyGate {
    if (!ClaimSafetyGate.instance) {
      ClaimSafetyGate.instance = new ClaimSafetyGate();
    }
    return ClaimSafetyGate.instance;
  }

  /**
   * Evaluates a single assertion against the Constitution's Claim Safety rules.
   */
  public auditAssertion(assertion: IntelligenceAssertion): SafetyAuditResult {
    const violations: string[] = [];

    // Rule 1: Support verification (C3 Invariant)
    if (assertion.support === 'UNSUPPORTED') {
      violations.push('Assertion lacks any supporting evidence reference (support=UNSUPPORTED)');
    }

    if (!assertion.evidenceRefs || assertion.evidenceRefs.length === 0) {
      if (assertion.kind === 'FACT' || assertion.kind === 'DERIVED_FACT' || assertion.kind === 'MANAGEMENT_CLAIM') {
        violations.push(`Factual claim of kind ${assertion.kind} has zero evidence references`);
      }
    }

    const text = assertion.text;

    // Rule 2: Motive Inferences
    for (const pattern of ClaimSafetyGate.FORBIDDEN_MOTIVE_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`Unsupported motive or psychological inference detected: matching "${pattern.source}"`);
        break;
      }
    }

    // Rule 3: Unadjudicated Manipulation / Fraud Claims
    for (const pattern of ClaimSafetyGate.FORBIDDEN_MANIPULATION_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`Unsupported market manipulation or fraud allegation detected: matching "${pattern.source}"`);
        break;
      }
    }

    // Rule 4: Speculative Governance Crisis Claims
    for (const pattern of ClaimSafetyGate.FORBIDDEN_CRISIS_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`Unsupported governance crisis claim detected: matching "${pattern.source}"`);
        break;
      }
    }

    // Rule 5: Value Superlatives
    for (const pattern of ClaimSafetyGate.FORBIDDEN_SUPERLATIVE_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`Unsubstantiated value superlative or promotional language detected: matching "${pattern.source}"`);
        break;
      }
    }

    // Rule 6: Definitive Price Predictions
    for (const pattern of ClaimSafetyGate.FORBIDDEN_PRICE_PREDICTION_PATTERNS) {
      if (pattern.test(text)) {
        violations.push(`Definitive future price prediction detected: matching "${pattern.source}"`);
        break;
      }
    }

    if (violations.length > 0) {
      return {
        passed: false,
        violations,
        originalText: text,
      };
    }

    return {
      passed: true,
      sanitizedAssertion: assertion,
      violations: [],
      originalText: text,
    };
  }

  /**
   * Filters and sanitizes a list of candidate assertions.
   * Discards all failing assertions and logs the rationale.
   */
  public filterAssertions(assertions: IntelligenceAssertion[]): {
    approved: IntelligenceAssertion[];
    rejected: SafetyAuditResult[];
  } {
    const approved: IntelligenceAssertion[] = [];
    const rejected: SafetyAuditResult[] = [];

    for (const assertion of assertions) {
      const result = this.auditAssertion(assertion);
      if (result.passed && result.sanitizedAssertion) {
        approved.push(result.sanitizedAssertion);
      } else {
        rejected.push(result);
      }
    }

    return { approved, rejected };
  }
}
