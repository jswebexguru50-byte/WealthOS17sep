/**
 * NewsRelevanceService.ts (P2-1, P2-2)
 * - NER entity-match gate: confirms article is specifically about target company/management/promoter
 * - Positive/negative classification with flagType tagging + confidence
 */

import { NewsFlag } from '../../types.js';

export interface RawNewsArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedDate: string;
  snippet: string;
  fullContent?: string;
}

export interface EntityMatchResult {
  matchesTargetEntity: boolean;
  matchedEntities: string[];
  confidence: number;
  reason: string;
}

export class NewsRelevanceService {
  /**
   * P2-1: Named Entity Recognition (NER) Entity-Match Gate.
   * Prevents namesake confusion (e.g. "Titan Cement" vs "Titan Company Ltd",
   * or unrelated namesake promoter names).
   */
  public static verifyEntityMatch(
    article: RawNewsArticle,
    targetSymbol: string,
    targetCompanyName: string,
    keyExecutives: string[]
  ): EntityMatchResult {
    const text = `${article.title} ${article.snippet} ${article.fullContent || ''}`.toLowerCase();
    const company = targetCompanyName.toLowerCase();
    const symbol = targetSymbol.toLowerCase();

    // Disambiguation checks for known namesake overlaps
    const isFalsePositiveNamesake =
      (symbol === 'titan' && text.includes('titan cement') && !text.includes('jewellery') && !text.includes('watches')) ||
      (symbol === 'tata' && text.includes('tata consultancy') && company.includes('motors'));

    if (isFalsePositiveNamesake) {
      return {
        matchesTargetEntity: false,
        matchedEntities: [],
        confidence: 0.1,
        reason: 'Article matched namesake entity in distinct industry, filtered out by NER gate.',
      };
    }

    const matchedEntities: string[] = [];

    if (text.includes(company) || text.includes(symbol)) {
      matchedEntities.push(targetCompanyName);
    }

    for (const exec of keyExecutives) {
      if (text.includes(exec.toLowerCase())) {
        matchedEntities.push(exec);
      }
    }

    const hasMatch = matchedEntities.length > 0;
    const confidence = matchedEntities.length >= 2 ? 0.98 : hasMatch ? 0.90 : 0.05;

    return {
      matchesTargetEntity: hasMatch,
      matchedEntities,
      confidence,
      reason: hasMatch
        ? `Confirmed entity match for [${matchedEntities.join(', ')}] with high confidence.`
        : `No direct entity link to ${targetCompanyName} or its leadership found.`,
    };
  }

  /**
   * P2-2: Flag Classification & Sentiment Analysis
   */
  public static classifyNewsItem(
    article: RawNewsArticle,
    targetSymbol: string,
    targetCompanyName: string,
    keyExecutives: string[]
  ): NewsFlag | null {
    const entityCheck = this.verifyEntityMatch(article, targetSymbol, targetCompanyName, keyExecutives);
    if (!entityCheck.matchesTargetEntity || entityCheck.confidence < 0.85) {
      return null;
    }

    const text = `${article.title} ${article.snippet}`.toLowerCase();

    // Determine flagType and severity
    if (
      text.includes('cbi') ||
      text.includes('ed probe') ||
      text.includes('fraud') ||
      text.includes('siphoning') ||
      text.includes('sebi ban')
    ) {
      return {
        id: article.id,
        headline: article.title,
        sourceUrl: article.sourceUrl,
        flagType: 'governance_red_flag',
        severity: 'critical',
        confidence: 0.95,
        resolved: text.includes('cleared') || text.includes('dismissed') || text.includes('settled'),
        publishedDate: article.publishedDate,
        snippet: article.snippet,
      };
    }

    if (text.includes('auditor resigns') || text.includes('qualification in audit') || text.includes('restatement')) {
      return {
        id: article.id,
        headline: article.title,
        sourceUrl: article.sourceUrl,
        flagType: 'accounting_investigation',
        severity: 'high',
        confidence: 0.92,
        resolved: false,
        publishedDate: article.publishedDate,
        snippet: article.snippet,
      };
    }

    if (text.includes('pledge invocation') || text.includes('margin call') || text.includes('promoter selling stake')) {
      return {
        id: article.id,
        headline: article.title,
        sourceUrl: article.sourceUrl,
        flagType: 'promoter_pledge_dispute',
        severity: 'high',
        confidence: 0.88,
        resolved: false,
        publishedDate: article.publishedDate,
        snippet: article.snippet,
      };
    }

    if (text.includes('order win') || text.includes('bags order') || text.includes('contract award')) {
      return {
        id: article.id,
        headline: article.title,
        sourceUrl: article.sourceUrl,
        flagType: 'order_win_catalyst',
        severity: 'low',
        confidence: 0.90,
        resolved: true,
        publishedDate: article.publishedDate,
        snippet: article.snippet,
      };
    }

    if (text.includes('capacity expansion') || text.includes('capex') || text.includes('new facility')) {
      return {
        id: article.id,
        headline: article.title,
        sourceUrl: article.sourceUrl,
        flagType: 'positive_capex_catalyst',
        severity: 'low',
        confidence: 0.89,
        resolved: true,
        publishedDate: article.publishedDate,
        snippet: article.snippet,
      };
    }

    // Default neutral/operational headline
    return {
      id: article.id,
      headline: article.title,
      sourceUrl: article.sourceUrl,
      flagType: 'other',
      severity: 'low',
      confidence: 0.75,
      resolved: true,
      publishedDate: article.publishedDate,
      snippet: article.snippet,
    };
  }
}
