/**
 * EventClassifier.ts — Generic Corporate Event Classification
 * WealthOS V2 Wave B (Live Data and Evidence Ingestion)
 *
 * Classifies raw exchange filings and announcements into standard event types
 * using generic semantic patterns — zero company-specific branching.
 */

export type CorporateEventType =
  | 'FINANCIAL_RESULTS'
  | 'ORDER_WIN'
  | 'CAPACITY_EXPANSION'
  | 'MANAGEMENT_CHANGE'
  | 'DIVIDEND_ANNOUNCEMENT'
  | 'ACQUISITION_MERGER'
  | 'REGULATORY_APPROVAL'
  | 'CREDIT_RATING'
  | 'SHAREHOLDING_CHANGE'
  | 'GENERAL_ANNOUNCEMENT';

export interface ClassifiedEvent {
  eventType: CorporateEventType;
  headline: string;
  summary: string;
  significance: 'CRITICAL' | 'MATERIAL' | 'ROUTINE';
  confidence: number;
}

export class EventClassifier {
  private static instance: EventClassifier;
  private constructor() {}

  public static getInstance(): EventClassifier {
    if (!EventClassifier.instance) {
      EventClassifier.instance = new EventClassifier();
    }
    return EventClassifier.instance;
  }

  public classify(title: string, content: string = ''): ClassifiedEvent {
    const text = `${title} ${content}`.toLowerCase();

    // 1. Financial Results
    if (
      text.includes('financial result') ||
      text.includes('unaudited result') ||
      text.includes('audited result') ||
      text.includes('quarterly result') ||
      text.includes('outcome of board meeting') && text.includes('result')
    ) {
      return {
        eventType: 'FINANCIAL_RESULTS',
        headline: title,
        summary: 'Financial results disclosure',
        significance: 'CRITICAL',
        confidence: 0.95,
      };
    }

    // 2. Order Win / Commercial Contract
    if (
      text.includes('order win') ||
      text.includes('bagged order') ||
      text.includes('award of contract') ||
      text.includes('receipt of order') ||
      text.includes('letter of intent') ||
      text.includes('loi') && text.includes('order')
    ) {
      return {
        eventType: 'ORDER_WIN',
        headline: title,
        summary: 'Commercial order or contract win',
        significance: 'MATERIAL',
        confidence: 0.9,
      };
    }

    // 3. Capacity Expansion / Capex
    if (
      text.includes('capacity expansion') ||
      text.includes('commissioning of') ||
      text.includes('new facility') ||
      text.includes('new plant') ||
      text.includes('commercial production') ||
      text.includes('capex')
    ) {
      return {
        eventType: 'CAPACITY_EXPANSION',
        headline: title,
        summary: 'Production capacity expansion or capex milestone',
        significance: 'MATERIAL',
        confidence: 0.88,
      };
    }

    // 4. Management / Board Change
    if (
      text.includes('resignation of') ||
      text.includes('appointment of') ||
      text.includes('change in director') ||
      text.includes('change in management') ||
      text.includes('chief executive') ||
      text.includes('managing director') ||
      text.includes('cfo') ||
      text.includes('key managerial personnel')
    ) {
      return {
        eventType: 'MANAGEMENT_CHANGE',
        headline: title,
        summary: 'Change in leadership or board of directors',
        significance: 'MATERIAL',
        confidence: 0.92,
      };
    }

    // 5. Dividend / Corporate Action
    if (
      text.includes('dividend') ||
      text.includes('bonus issue') ||
      text.includes('stock split') ||
      text.includes('buyback') ||
      text.includes('rights issue')
    ) {
      return {
        eventType: 'DIVIDEND_ANNOUNCEMENT',
        headline: title,
        summary: 'Corporate action or dividend announcement',
        significance: 'ROUTINE',
        confidence: 0.9,
      };
    }

    // 6. Acquisition / Merger / Joint Venture
    if (
      text.includes('acquisition') ||
      text.includes('amalgamation') ||
      text.includes('merger') ||
      text.includes('joint venture') ||
      text.includes('takeover')
    ) {
      return {
        eventType: 'ACQUISITION_MERGER',
        headline: title,
        summary: 'M&A or Joint Venture transaction',
        significance: 'CRITICAL',
        confidence: 0.88,
      };
    }

    // 7. Regulatory / Government Approval
    if (
      text.includes('approval received') ||
      text.includes('usfda') ||
      text.includes('regulatory clearance') ||
      text.includes('license granted') ||
      text.includes('environmental clearance')
    ) {
      return {
        eventType: 'REGULATORY_APPROVAL',
        headline: title,
        summary: 'Regulatory approval or statutory clearance',
        significance: 'MATERIAL',
        confidence: 0.85,
      };
    }

    // 8. Credit Rating
    if (
      text.includes('credit rating') ||
      text.includes('rating upgraded') ||
      text.includes('rating downgraded') ||
      text.includes('crisil') ||
      text.includes('care ratings') ||
      text.includes('icra')
    ) {
      return {
        eventType: 'CREDIT_RATING',
        headline: title,
        summary: 'Credit rating agency update',
        significance: 'ROUTINE',
        confidence: 0.85,
      };
    }

    // 9. Shareholding Change
    if (
      text.includes('shareholding pattern') ||
      text.includes('pledge') ||
      text.includes('revocation of pledge') ||
      text.includes('insider trading disclosure') ||
      text.includes('sast')
    ) {
      return {
        eventType: 'SHAREHOLDING_CHANGE',
        headline: title,
        summary: 'Shareholding or promoter holding update',
        significance: 'ROUTINE',
        confidence: 0.85,
      };
    }

    return {
      eventType: 'GENERAL_ANNOUNCEMENT',
      headline: title,
      summary: 'General corporate announcement',
      significance: 'ROUTINE',
      confidence: 0.7,
    };
  }
}
