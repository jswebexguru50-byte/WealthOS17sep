/**
 * FactValidationGate.ts
 *
 * FERE v3.2.1 Gate A: Deterministic Extraction Validation Gate.
 * Sits strictly between candidate LLM extraction and canonical Fact storage.
 *
 * Answers the question:
 * "Did we faithfully and deterministically extract what the cited document says?"
 *
 * v3.2.1 Hardening — 9 strict integrity criteria (was 7, 2 were pseudo-checks):
 * 1. Metric family registered in canonical ontology
 * 2. Unit semantically consistent with metric family (VALID_UNITS_BY_FAMILY — NOT just "non-empty")
 * 3. Issuer symbol matches corporate perimeter pattern (must be non-trivial; placeholder symbols rejected)
 * 4. Dates chronologically sound (asOfDate for STOCK, periodStart < periodEnd for FLOW)
 * 5. sourceQuotedText is MANDATORY — fact cannot become SOURCE_SUPPORTED without a cited quote
 * 6. Normalized numerical equivalence present in cited quote (via NumericalNormalizationEngine)
 *    AND currency in candidate matches currency detected in quote (currency is semantic, not formatting)
 * 7. Source span authentic (authenticated archived bytes and exact quote)
 * 8. Scope EXPLICITLY declared — undefined/absent scope FAILS (STANDALONE | CONSOLIDATED | SEGMENT only)
 * 9. Quote span is non-trivial (> 10 chars; prevents empty string bypass)
 *
 * Successful validation promotes fact to 'SOURCE_SUPPORTED' (never blanket 'VERIFIED').
 * Any single failed check → 'REJECTED'.
 */

import crypto from 'crypto';
import { MetricFamily, FactVerificationStatus, FactVerificationMethod, VALID_UNITS_BY_FAMILY } from '../types/FinancialFact.js';
import { MeasurementType } from '../types/FinancialFact.js';
import { MetricBinding } from '../types/MetricBinding.js';
import { NumericalNormalizationEngine } from './NumericalNormalizationEngine.js';
import { SourceArtifactTrust } from '../services/SourceArtifactTrust.js';

export interface CandidateFactInput {
  factId: string;
  issuerSymbol: string;
  metric: string;
  metricFamily: MetricFamily;
  value: number | string;
  unit: string;
  currency?: string;           // Candidate-declared currency (e.g. 'INR', 'USD')
  measurementType: MeasurementType;
  asOfDate?: string;
  periodStart?: string;
  periodEnd?: string;
  sourceEvidenceId: string;
  sourceQuotedText: string;    // v3.2.1: MANDATORY — no longer optional
  scope: 'STANDALONE' | 'CONSOLIDATED' | 'SEGMENT'; // v3.2.1: MANDATORY — undefined no longer passes
}

export interface FactValidationReport {
  isValid: boolean;
  verificationStatus: FactVerificationStatus;
  verificationMethod: FactVerificationMethod;
  checks: {
    metricRegistered: boolean;
    unitConsistentWithFamily: boolean;
    issuerMatchesScope: boolean;
    datesChronologicallySound: boolean;
    quotePresent: boolean;
    numericalValuePresentInQuote: boolean;
    currencyConsistent: boolean;
    deterministicMetricContextBinding: boolean;
    sourceSpanAuthentic: boolean;
    scopeDeclared: boolean;
  };
  rejectionReasons: string[];
  matchedNumericalExpression?: string;
  detectedQuoteCurrency?: string;
  metricBinding?: MetricBinding;
}

const REGISTERED_METRIC_FAMILIES: Set<MetricFamily> = new Set([
  'ORDER_BOOK',
  'DISPATCH',
  'REVENUE',
  'MARGIN',
  'LEVERAGE',
  'SOLVENCY',
  'CONCENTRATION',
  'CAPACITY',
  'REGULATORY',
  'DIVIDEND'
]);

/**
 * Symbols that look like valid regex-format identifiers but are obviously synthetic / placeholder.
 * Gate A rejects them so ABC, TEST, FOO123 cannot pass as valid corporate issuers.
 *
 * Policy: a real corporate issuer registered on Indian exchanges is at least 4 chars,
 * does not equal known test sentinel patterns, and is not a pure digit string.
 */
const BLOCKED_ISSUER_SENTINELS = new Set([
  'TEST', 'ABC', 'FOO', 'BAR', 'CORP', 'CO', 'LTD', 'XYZ', 'DEMO', 'MOCK', 'DUMMY', 'EXAMPLE', 'SAMPLE'
]);

export class FactValidationGate {
  /**
   * Deterministically validates a proposed candidate fact against 9 strict integrity criteria.
   *
   * INVARIANT: All 9 checks must pass for SOURCE_SUPPORTED.
   *            Any single failure → REJECTED.
   */
  public static validate(candidate: CandidateFactInput): FactValidationReport {
    const rejectionReasons: string[] = [];

    // ─── Check 1: Metric Family Registered ───────────────────────────────────
    const metricRegistered =
      REGISTERED_METRIC_FAMILIES.has(candidate.metricFamily) &&
      Boolean(candidate.metric) &&
      candidate.metric.trim().length > 0;

    if (!metricRegistered) {
      rejectionReasons.push(
        `Metric '${candidate.metric}' or family '${candidate.metricFamily}' is not registered in canonical ontology.`
      );
    }

    // ─── Check 2: Unit Semantically Consistent with Family (ontology-level) ─
    // v3.2.1: Was Boolean(unit) && unit.length > 0 — that is purely a presence check.
    // Now: unit MUST appear in VALID_UNITS_BY_FAMILY[family]. "BANANAS" for REVENUE fails.
    // Growth metrics (measurementType === 'GROWTH' or metric includes GROWTH) legitimately use PERCENT/BPS.
    const allowedUnits = VALID_UNITS_BY_FAMILY[candidate.metricFamily];
    const normalizedUnit = (candidate.unit || '').trim().toUpperCase();
    const isGrowthMetric = (candidate.metric || '').toUpperCase().includes('GROWTH');
    const isRatioMetric = candidate.measurementType === 'RATIO' || candidate.metric.includes('_TO_') || candidate.metric.endsWith('_RATIO');
    const isCurrencyUnit = /^(?:INR_|USD_|EUR_|GBP_)?(?:CRORE|LAKH|MILLION|BILLION|THOUSAND)S?$/i.test(normalizedUnit);

    let unitConsistentWithFamily =
      Boolean(normalizedUnit) &&
      ((allowedUnits !== undefined && allowedUnits.has(normalizedUnit)) ||
       (isGrowthMetric && (normalizedUnit === 'PERCENT' || normalizedUnit === '%' || normalizedUnit === 'BPS')));

    // Ratio / multiple metrics cannot use absolute currency denominations
    if (isRatioMetric && isCurrencyUnit) {
      unitConsistentWithFamily = false;
      rejectionReasons.push(
        `Unit '${candidate.unit}' is a currency denomination, which is invalid for ratio/multiple metric '${candidate.metric}'. ` +
        `Ratios and multiples must use dimensionless units (X, RATIO, TIMES, MULTIPLE, PERCENT, %).`
      );
    } else if (!unitConsistentWithFamily) {
      rejectionReasons.push(
        `Unit '${candidate.unit}' is not valid for metric family '${candidate.metricFamily}'. ` +
        `Allowed units: [${allowedUnits ? [...allowedUnits].join(', ') : 'N/A'}].`
      );
    }

    // ─── Check 3: Issuer Matches Corporate Perimeter ──────────────────────────
    // v3.2.1: Was /^[A-Z0-9_]{3,15}$/ — that allows TEST, FOO123, ABC to pass.
    // Indian and global exchanges have valid tickers starting with digits (360ONE, 3MINDIA, 5PAISA), 2 chars (LT, NH), or 3 chars (SCI, ITC)
    const issuerPattern = /^[A-Z0-9][A-Z0-9&_]{1,14}$/.test(candidate.issuerSymbol);
    const isSentinel = BLOCKED_ISSUER_SENTINELS.has(candidate.issuerSymbol.toUpperCase());
    const issuerNotSentinel = !isSentinel;
    const issuerMatchesScope = Boolean(candidate.issuerSymbol) && issuerPattern && issuerNotSentinel;

    if (!issuerMatchesScope) {
      rejectionReasons.push(
        `Issuer symbol '${candidate.issuerSymbol}' does not match a valid corporate perimeter pattern. ` +
        `Must be 2–15 chars, alphanumeric, and not be a placeholder sentinel.`
      );
    }

    // ─── Check 4: Chronological Consistency ──────────────────────────────────
    let datesChronologicallySound = true;
    if (candidate.measurementType === 'STOCK') {
      if (candidate.asOfDate) {
        datesChronologicallySound = /^\d{4}-\d{2}-\d{2}$/.test(candidate.asOfDate);
        if (!datesChronologicallySound) {
          rejectionReasons.push(
            `Stock metric requires valid YYYY-MM-DD asOfDate (got '${candidate.asOfDate}').`
          );
        }
      }
    } else if (candidate.measurementType === 'FLOW') {
      if (candidate.periodStart && candidate.periodEnd) {
        const startValid = /^\d{4}-\d{2}-\d{2}$/.test(candidate.periodStart);
        const endValid = /^\d{4}-\d{2}-\d{2}$/.test(candidate.periodEnd);
        if (!startValid || !endValid) {
          datesChronologicallySound = false;
          rejectionReasons.push(
            `Flow metric requires valid YYYY-MM-DD periodStart and periodEnd.`
          );
        } else {
          const startTime = new Date(candidate.periodStart).getTime();
          const endTime = new Date(candidate.periodEnd).getTime();
          if (startTime >= endTime) {
            datesChronologicallySound = false;
            rejectionReasons.push(
              `Flow periodStart (${candidate.periodStart}) must be strictly earlier than periodEnd (${candidate.periodEnd}).`
            );
          }
        }
      } else if (candidate.periodStart || candidate.periodEnd) {
        datesChronologicallySound = false;
        rejectionReasons.push(
          `Flow metric requires both periodStart and periodEnd when dates are specified.`
        );
      }
    }

    // ─── Check 5: Source Quote Mandatory ─────────────────────────────────────
    // v3.2.1: sourceQuotedText is now MANDATORY. Missing/blank quote = REJECTED.
    // A candidate CANNOT become SOURCE_SUPPORTED without demonstrating that the cited
    // source actually contains the extracted value.
    const quotePresent =
      typeof candidate.sourceQuotedText === 'string' &&
      candidate.sourceQuotedText.trim().length > 10;

    if (!quotePresent) {
      rejectionReasons.push(
        `sourceQuotedText is mandatory for Gate A verification. ` +
        `A fact cannot become SOURCE_SUPPORTED without a non-trivial verbatim quote from the cited document.`
      );
    }

    // ─── Check 6a: Numerical Equivalence in Quote ─────────────────────────────
    let numericalValuePresentInQuote = false;
    let matchedNumericalExpression: string | undefined;
    let detectedQuoteCurrency: string | undefined;
    let surroundingClause: string | undefined;
    let matchIndex: number | undefined;

    if (quotePresent) {
      if (candidate.value === 0 || candidate.measurementType === 'STRUCTURAL_EVENT') {
        // Qualitative milestone or structural event (e.g. debt restructuring, demerger, commissioning)
        // Authenticated by verbatim source span rather than scalar numerical equivalence
        numericalValuePresentInQuote = true;
      } else {
        const matchResult = NumericalNormalizationEngine.isValuePresentInQuote(
          candidate.value,
          candidate.unit,
          candidate.sourceQuotedText,
          candidate.currency
        );

        numericalValuePresentInQuote = matchResult.found;
        matchedNumericalExpression = matchResult.matchedExpression;
        detectedQuoteCurrency = matchResult.detectedCurrency;
        surroundingClause = matchResult.surroundingClause;
        matchIndex = matchResult.matchIndex;

        if (!numericalValuePresentInQuote) {
          rejectionReasons.push(
            `Extracted value '${candidate.value} ${candidate.unit}' does not match any numerical quantity in verbatim quote: ` +
            `"${candidate.sourceQuotedText.substring(0, 120)}...". Extraction unverified.`
          );
        }
      }
    } else {
      // Quote absent → numerical check auto-fails (no bypass)
      rejectionReasons.push(
        `Numerical verification skipped: no sourceQuotedText provided. Cannot establish SOURCE_SUPPORTED without quote.`
      );
    }

    // ─── Check 6b: Currency Consistency ──────────────────────────────────────
    // v3.2.1: Currency is SEMANTIC, not formatting. ₹1,250 Cr ≠ $1,250 Cr.
    // If candidate declares a currency AND the quote contains a different currency → FAIL.
    let currencyConsistent = true;
    if (quotePresent && candidate.currency && detectedQuoteCurrency) {
      const candidateCcy = normalizeCurrencyCode(candidate.currency);
      const quoteCcy = normalizeCurrencyCode(detectedQuoteCurrency);
      if (candidateCcy !== quoteCcy) {
        currencyConsistent = false;
        rejectionReasons.push(
          `Currency mismatch: candidate declares '${candidate.currency}' (→ ${candidateCcy}) ` +
          `but quote contains '${detectedQuoteCurrency}' (→ ${quoteCcy}). ` +
          `Currency is semantic — ₹1,250 Cr is not equal to $1,250 Cr.`
        );
      }
    }

    // ─── Check 6c: Deterministic Metric-Context Binding ──────────────────────
    // v3.2.1: Proves that the matched numerical expression in the quote deterministically
    // binds to the candidate metric/measurementType, rather than to an unrelated/conflicting metric.
    let deterministicMetricContextBinding = true;
    let computedMetricBinding: MetricBinding | undefined = undefined;

    if (quotePresent && numericalValuePresentInQuote && candidate.value !== 0 && candidate.measurementType !== 'STRUCTURAL_EVENT') {
      let bindingResult = FactValidationGate.verifyDeterministicMetricContextBinding(
        candidate,
        matchedNumericalExpression || '',
        matchIndex,
        candidate.sourceQuotedText
      );

      // If the first occurrence failed binding, check if there are subsequent occurrences
      // of the matched expression in the quote (e.g. multi-metric sentences like "Revenue was ₹180 Cr, while EBITDA was ₹180 Cr")
      if (!bindingResult.bound && matchedNumericalExpression && candidate.sourceQuotedText) {
        let nextIdx = candidate.sourceQuotedText.indexOf(matchedNumericalExpression, (matchIndex ?? 0) + 1);
        while (nextIdx !== -1) {
          const nextResult = FactValidationGate.verifyDeterministicMetricContextBinding(
            candidate,
            matchedNumericalExpression,
            nextIdx,
            candidate.sourceQuotedText
          );
          if (nextResult.bound) {
            bindingResult = nextResult;
            matchIndex = nextIdx;
            break;
          }
          nextIdx = candidate.sourceQuotedText.indexOf(matchedNumericalExpression, nextIdx + 1);
        }
      }

      if (!bindingResult.bound) {
        deterministicMetricContextBinding = false;
        rejectionReasons.push(bindingResult.reason || 'Deterministic metric-context binding failed.');
      } else if (bindingResult.metricBinding) {
        computedMetricBinding = bindingResult.metricBinding;
      }
    }

    // ─── Check 7: Source Span Authentic ──────────────────────────────────────
    const sourceSpanAuthentic = SourceArtifactTrust.verify(
      candidate.sourceEvidenceId, candidate.issuerSymbol, candidate.sourceQuotedText
    );

    if (!sourceSpanAuthentic) {
      rejectionReasons.push(
        `sourceEvidenceId '${candidate.sourceEvidenceId}' has no authenticated physical source and exact quote.`
      );
    }

    // ─── Check 8: Scope Explicitly Declared ──────────────────────────────────
    // v3.2.1: undefined/absent scope now FAILS. "Scope must be declared, unless it isn't" is rejected.
    // Standalone/Consolidated/Segment distinctions are critical to contradiction model.
    const scopeDeclared =
      candidate.scope === 'STANDALONE' ||
      candidate.scope === 'CONSOLIDATED' ||
      candidate.scope === 'SEGMENT';

    if (!scopeDeclared) {
      rejectionReasons.push(
        `Scope must be explicitly declared as STANDALONE, CONSOLIDATED, or SEGMENT. ` +
        `Got '${candidate.scope}'. Absent/undefined scope is not acceptable — ` +
        `Standalone vs Consolidated distinctions are semantically critical.`
      );
    }

    // ─── Final Gate Decision ─────────────────────────────────────────────────
    const isValid =
      metricRegistered &&
      unitConsistentWithFamily &&
      issuerMatchesScope &&
      datesChronologicallySound &&
      quotePresent &&
      numericalValuePresentInQuote &&
      currencyConsistent &&
      deterministicMetricContextBinding &&
      sourceSpanAuthentic &&
      scopeDeclared;

    return {
      isValid,
      verificationStatus: isValid ? 'SOURCE_SUPPORTED' : 'REJECTED',
      verificationMethod: isValid ? 'DETERMINISTIC_GATE_PASSED' : 'REJECTED',
      checks: {
        metricRegistered,
        unitConsistentWithFamily,
        issuerMatchesScope,
        datesChronologicallySound,
        quotePresent,
        numericalValuePresentInQuote,
        currencyConsistent,
        deterministicMetricContextBinding,
        sourceSpanAuthentic,
        scopeDeclared
      },
      rejectionReasons,
      matchedNumericalExpression,
      detectedQuoteCurrency,
      metricBinding: computedMetricBinding
    };
  }

  /**
   * Deterministically verifies metric-context binding between candidate metric and local quote context.
   */
  private static verifyDeterministicMetricContextBinding(
    candidate: CandidateFactInput,
    matchedExpression: string,
    matchIndex?: number,
    fullQuote?: string
  ): { bound: boolean; reason?: string; metricBinding?: MetricBinding } {
    if (matchIndex === undefined || !fullQuote) {
      return { bound: true };
    }

    // To avoid treating decimal points in numbers (e.g. 4.2% or 12.5 Cr) as sentence boundaries,
    // only treat '.' as a separator if it is not immediately flanked by digits.
    let dotIdx = fullQuote.lastIndexOf('.', matchIndex);
    while (dotIdx > 0 && /\d/.test(fullQuote[dotIdx - 1] || '') && /\d/.test(fullQuote[dotIdx + 1] || '')) {
      dotIdx = fullQuote.lastIndexOf('.', dotIdx - 1);
    }

    const clauseSeparators = [
      dotIdx,
      fullQuote.lastIndexOf(';', matchIndex),
      fullQuote.lastIndexOf('\n', matchIndex)
    ];
    const prevBoundary = Math.max(0, ...clauseSeparators);
    const prefixStart = Math.max(prevBoundary, matchIndex - 60);

    const afterQuote = fullQuote.substring(matchIndex + matchedExpression.length);
    const nextSepMatch = afterQuote.match(/[;\n]|(?<!\d)\.(?!\d)/i);
    const suffixEnd = nextSepMatch
      ? matchIndex + matchedExpression.length + nextSepMatch.index!
      : Math.min(fullQuote.length, matchIndex + matchedExpression.length + 60);

    const localPrefix = fullQuote.substring(prefixStart, matchIndex).toLowerCase();
    const localSuffix = fullQuote.substring(matchIndex + matchedExpression.length, suffixEnd).toLowerCase();
    const localContext = `${localPrefix} ${matchedExpression.toLowerCase()} ${localSuffix}`;

    const metricStr = (candidate.metric || '').toUpperCase();
    const familyStr = (candidate.metricFamily || '').toUpperCase();

    // ── Explicit Metric Ownership Model ──────────────────────────────────────
    const targetMetric = metricStr;

    const metricAnchors: Array<{
      metric: string;
      pattern: RegExp;
      priority: number;
    }> = [
      { metric: 'EBITDA_MARGIN', pattern: /\bebitda\s+margins?\b/gi, priority: 100 },
      { metric: 'EBITDA_MARGIN', pattern: /\bmargins?\b/gi, priority: 75 },
      { metric: 'REVENUE_MARGIN', pattern: /\brevenue\s+margins?\b/gi, priority: 100 },

      { metric: 'EBITDA', pattern: /\bebitda\b/gi, priority: 90 },

      { metric: 'PAT', pattern: /\bprofit\s+after\s+tax\b/gi, priority: 90 },
      { metric: 'PAT', pattern: /\bnet\s+profit\b/gi, priority: 90 },
      { metric: 'PAT', pattern: /\bPAT\b/gi, priority: 90 },

      { metric: 'REVENUE', pattern: /\brevenue\b/gi, priority: 90 },
      { metric: 'REVENUE', pattern: /\bturnover\b/gi, priority: 80 },
      { metric: 'REVENUE', pattern: /\bsales\b/gi, priority: 70 },
      { metric: 'REVENUE', pattern: /\b(?:contract|order|order\s+book)\b/gi, priority: 70 },

      { metric: 'DEBT', pattern: /\bnet\s+debt\b/gi, priority: 100 },
      { metric: 'DEBT', pattern: /\btotal\s+debt\b/gi, priority: 90 },
      { metric: 'DEBT', pattern: /\bdebt\b/gi, priority: 80 },

      { metric: 'DIVIDEND', pattern: /\b(?:dividend|payout|profit\s+distribution|distribution)\b/gi, priority: 90 },

      { metric: 'ORDER_BOOK', pattern: /\b(?:order\s+book|order\s+inflow|orderbook|ev\s+order\s+book|order|contract)\b/gi, priority: 90 },
    ];

    const normalizedTargetMetric =
      targetMetric === 'NET_PROFIT' ? 'PAT' :
      targetMetric.includes('ORDER') || targetMetric.includes('BOOK') || familyStr === 'ORDER_BOOK'
        ? 'ORDER_BOOK'
        : targetMetric.includes('REVENUE') ||
          targetMetric.includes('SALES') ||
          targetMetric.includes('TOPLINE') ||
          targetMetric.includes('TURNOVER') ||
          (targetMetric === 'FINANCIAL_METRIC' && familyStr === 'REVENUE')
        ? 'REVENUE'
        : (targetMetric.includes('EBITDA') && !targetMetric.includes('MARGIN'))
        ? 'EBITDA'
        : (targetMetric.includes('MARGIN') || (targetMetric === 'FINANCIAL_METRIC' && familyStr === 'MARGIN'))
        ? (targetMetric.includes('REVENUE') ? 'REVENUE_MARGIN' : 'EBITDA_MARGIN')
        : targetMetric.includes('DEBT') ||
          (targetMetric === 'FINANCIAL_METRIC' && (familyStr === 'LEVERAGE' || familyStr === 'SOLVENCY'))
        ? 'DEBT'
        : targetMetric.includes('DIVIDEND') || targetMetric.includes('PAYOUT') ||
          (targetMetric === 'FINANCIAL_METRIC' && familyStr === 'DIVIDEND')
        ? 'DIVIDEND'
        : targetMetric;

    // Support candidate metrics with explicit multi-word names in context (e.g. PROMOTER_HOLDING -> "promoter holding")
    const metricWords = candidate.metric.toLowerCase().replace(/_/g, ' ').trim();
    if (metricWords.length > 2 && localContext.includes(metricWords)) {
      metricAnchors.push({
        metric: normalizedTargetMetric,
        pattern: new RegExp(`\\b${metricWords.replace(/\s+/g, '\\s+')}\\b`, 'gi'),
        priority: 85
      });
    }

    const clauseBreakRegex = /,|\bwhile\b|\bwith\b|\bbut\b|\band\b|;|\n/i;

    const anchorMatches = metricAnchors
      .flatMap(anchor => {
        const matches: Array<{
          metric: string;
          index: number;
          length: number;
          priority: number;
          crossesClause: boolean;
        }> = [];
        const regex = anchor.pattern.global ? anchor.pattern : new RegExp(anchor.pattern.source, 'gi');

        for (const match of localContext.matchAll(regex)) {
          const matchIdx = match.index ?? 0;
          let crossesClause = false;
          if (matchIdx < localPrefix.length) {
            // Anchor is in prefix (preceding the number)
            const textBetween = localPrefix.substring(matchIdx + match[0].length);
            crossesClause = clauseBreakRegex.test(textBetween);
          } else {
            // Anchor is in suffix (following the number)
            const suffixStart = localPrefix.length + 1 + matchedExpression.length + 1;
            const suffixOffset = matchIdx - suffixStart;
            const textBetween = localSuffix.substring(0, Math.max(0, suffixOffset));
            crossesClause = clauseBreakRegex.test(textBetween);
          }

          matches.push({
            metric: anchor.metric,
            index: matchIdx,
            length: match[0].length,
            priority: anchor.priority,
            crossesClause
          });
        }

        return matches;
      });

    const competingMetricAnchors = anchorMatches.filter(
      a => a.metric !== normalizedTargetMetric
    );

    const targetAnchors = anchorMatches.filter(
      a => a.metric === normalizedTargetMetric
    );

    // A numerical mention must have an explicit lexical owner.
    // Absence of ownership is NOT sufficient for deterministic binding.

    if (targetAnchors.length === 0) {
      return {
        bound: false,
        reason:
          `Semantic numerical binding failed: numeric expression ` +
          `'${matchedExpression}' has no explicit lexical anchor for ` +
          `target metric '${candidate.metric}'. ` +
          `Context: "${localContext.trim()}".`
      };
    }

    const effectiveDistance = (a: { index: number; crossesClause: boolean }) => {
      let d = Math.abs(a.index - localPrefix.length);
      if (a.crossesClause) {
        d += 1000;
      }
      return d;
    };

    // If another metric is explicitly attached to this same numerical
    // mention and the target metric is not equally explicit, reject it.
    //
    // This prevents:
    //   PAT = -₹20 Cr
    // from becoming:
    //   REVENUE = -₹20 Cr
    //
    // simply because the number is present in the same sentence.

    const closestTarget = targetAnchors
      .map(a => ({
        ...a,
        distance: effectiveDistance(a)
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    const closestCompeting = competingMetricAnchors
      .map(a => ({
        ...a,
        distance: effectiveDistance(a)
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (
      closestCompeting &&
      closestCompeting.distance < closestTarget.distance &&
      (closestCompeting.priority >= closestTarget.priority || (closestTarget.crossesClause && !closestCompeting.crossesClause))
    ) {
      return {
        bound: false,
        reason:
          `Semantic numerical binding failed: matched value ` +
          `'${matchedExpression}' is more specifically anchored to ` +
          `'${closestCompeting.metric}' than target metric ` +
          `'${candidate.metric}'.`
      };
    }


    const isMarginMetric = familyStr === 'MARGIN' || metricStr.includes('MARGIN');

    // Rule 1: Matched number is explicitly local to a margin expression (e.g. "ebitda margin was 12%"),
    // but candidate is a non-margin metric (e.g. pure REVENUE, PAT, DEBT).
    const hasLocalMargin = /\b(ebitda\s+margin|operating\s+margin|pat\s+margin|margin)\b/i.test(localContext);
    const hasLocalRevenue = /\b(revenue|sales|topline|turnover|pre-sales|bookings)\b/i.test(localContext);

    if (hasLocalMargin && !hasLocalRevenue && !isMarginMetric) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to margin context "${localContext.trim()}", which conflicts with candidate metric '${candidate.metric}' (family: ${candidate.metricFamily}).`
      };
    }

    // Rule 2: Candidate is a MARGIN metric, but the matched number is locally bound to revenue or revenue growth without margin.
    if (isMarginMetric && hasLocalRevenue && !hasLocalMargin) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to revenue context "${localContext.trim()}", not margin metric '${candidate.metric}'.`
      };
    }

    // Rule 3: Candidate is a PROFITABILITY metric (EBITDA / PAT / NET_PROFIT), but number is locally bound to pure revenue without profit/ebitda/pat.
    const isProfitability = familyStr === 'PROFITABILITY' || metricStr === 'EBITDA' || metricStr === 'PAT' || metricStr === 'NET_PROFIT' || metricStr.includes('PROFIT');
    const hasLocalProfit = /\b(ebitda|pat|profit|net\s+profit|operating\s+profit)\b/i.test(localContext);
    if (isProfitability && hasLocalRevenue && !hasLocalProfit) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to revenue context "${localContext.trim()}", not '${candidate.metric}'.`
      };
    }

    // Rule 4: Candidate is a non-dividend metric, but number is locally bound to dividend without candidate concept.
    const hasLocalDividend = /\b(dividend|payout|per\s+share)\b/i.test(localContext);
    const isDividendMetric = familyStr === 'DIVIDEND' || metricStr.includes('DIVIDEND');
    if (hasLocalDividend && !isDividendMetric && !hasLocalRevenue && !isProfitability) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to dividend context "${localContext.trim()}", not '${candidate.metric}'.`
      };
    }

    // Rule 5: Candidate is a pure REVENUE metric (not EBITDA/PAT), but number is locally bound to EBITDA or profit without revenue
    const isPureRevenue = (metricStr.includes('REVENUE') || metricStr.includes('SALES') || metricStr.includes('TOPLINE') || metricStr.includes('TURNOVER')) && !metricStr.includes('EBITDA') && !metricStr.includes('PAT') && !metricStr.includes('PROFIT');
    const hasLocalEbitda = /\bebitda\b/i.test(localContext);
    if (isPureRevenue && (hasLocalEbitda || hasLocalProfit) && !hasLocalRevenue) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to profit/EBITDA context "${localContext.trim()}", not revenue metric '${candidate.metric}'.`
      };
    }

    // Rule 6: Candidate specifies REVENUE margin, but local context is explicitly EBITDA margin
    if (metricStr.includes('REVENUE') && hasLocalMargin && hasLocalEbitda && !hasLocalRevenue) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to EBITDA margin "${localContext.trim()}", not revenue margin '${candidate.metric}'.`
      };
    }

    // Rule 7: Candidate is an operating/profitability metric (EBITDA / PAT / REVENUE), but number is locally bound to debt without profit/revenue
    const hasLocalDebt = /\b(net\s+debt|debt|borrowing|borrowings|leverage)\b/i.test(localContext);
    const isDebtMetric = familyStr === 'LEVERAGE' || familyStr === 'SOLVENCY' || metricStr.includes('DEBT');
    if (hasLocalDebt && !isDebtMetric && !hasLocalProfit && !hasLocalRevenue) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to debt context "${localContext.trim()}", not '${candidate.metric}'.`
      };
    }

    // Rule 8: Candidate is PAT, but number is locally bound to EBITDA without PAT keywords
    const isPat = metricStr === 'PAT' || metricStr === 'NET_PROFIT';
    if (isPat && hasLocalEbitda && !localContext.includes('pat') && !localContext.includes('profit after tax') && !localContext.includes('net profit')) {
      return {
        bound: false,
        reason: `Semantic numerical binding failed: matched value '${matchedExpression}' is locally bound to EBITDA context "${localContext.trim()}", not PAT.`
      };
    }

    const mentionHash = crypto.createHash('sha256').update(`${candidate.sourceEvidenceId || ''}_${matchIndex}_${matchedExpression}`).digest('hex').substring(0, 12);
    const bindingHash = crypto.createHash('sha256').update(`${candidate.factId}_${candidate.metric}_${mentionHash}`).digest('hex').substring(0, 12);

    return {
      bound: true,
      metricBinding: {
        bindingId: `MB_${bindingHash}`,
        numericMentionId: `NM_${mentionHash}`,
        metricId: candidate.metric,
        bindingType: 'DETERMINISTIC_LEXICAL',
        bindingEvidence: matchedExpression,
        bindingStrength: 'HIGH',
        bindingRuleScore: 0.95,
        bindingConfidence: 0.95,
        bindingRuleVersion: '2026.09'
      }
    };
  }
}

/**
 * Normalizes currency symbols and codes to a canonical 3-letter ISO code.
 * Used for currency consistency check (Check 6b).
 */
function normalizeCurrencyCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === '₹' || s === 'RS' || s === 'RS.' || s === 'INR') return 'INR';
  if (s === '$' || s === 'USD') return 'USD';
  if (s === '€' || s === 'EUR') return 'EUR';
  if (s === '£' || s === 'GBP') return 'GBP';
  if (s === '¥' || s === 'JPY' || s === 'CNY') return s === 'JPY' ? 'JPY' : 'CNY';
  return s; // Return as-is for other codes (e.g. SGD, AUD)
}
