import { QualitativeEvidenceItem } from './QualitativeEvidenceExtractor.js';

export type QualitativeSignal = {
  signal:
    | 'BUSINESS_DESCRIPTION_AVAILABLE'
    | 'MANAGEMENT_CHANGE_PRESENT'
    | 'CREDIT_DEBT_EVENT_PRESENT'
    | 'PROMOTER_PLEDGE_RISK'
    | 'INSIDER_SELLING_PRESENT'
    | 'SAST_OR_BULK_DEAL_PRESENT'
    | 'CORPORATE_ACTION_PRESENT'
    | 'GOVERNANCE_REVIEW_REQUIRED'
    | 'SECTOR_CLASSIFIED'
    | 'DOCUMENT_SUPPORT_AVAILABLE';
  polarity: 'SUPPORTIVE' | 'NEGATIVE' | 'MIXED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: QualitativeEvidenceItem;
  deterministicReason: string;
};

export class QualitativeSignalClassifier {
  public classify(item: QualitativeEvidenceItem): QualitativeSignal | null {
    const textLower = item.text.toLowerCase();

    switch (item.category) {
      case 'BUSINESS_DESCRIPTION':
        return {
          signal: 'BUSINESS_DESCRIPTION_AVAILABLE',
          polarity: 'MIXED',
          severity: 'LOW',
          evidence: item,
          deterministicReason: 'Business description present; supports source coverage completeness but does not automatically award moat points.',
        };

      case 'MANAGEMENT_CHANGE':
        return {
          signal: 'MANAGEMENT_CHANGE_PRESENT',
          polarity: 'MIXED',
          severity: 'MEDIUM',
          evidence: item,
          deterministicReason: 'Management change detected. Requires manual watch/review.',
        };

      case 'CREDIT_DEBT_EVENT':
        if (
          textLower.includes('downgrade') ||
          textLower.includes('default') ||
          textLower.includes('delay') ||
          textLower.includes('insolvency') ||
          textLower.includes('restructuring')
        ) {
          return {
            signal: 'CREDIT_DEBT_EVENT_PRESENT',
            polarity: 'NEGATIVE',
            severity: 'HIGH',
            evidence: item,
            deterministicReason: 'Adverse credit/debt keywords detected (downgrade, default, etc).',
          };
        }
        if (textLower.includes('reaffirmed') || textLower.includes('upgrade')) {
          return {
            signal: 'CREDIT_DEBT_EVENT_PRESENT',
            polarity: 'SUPPORTIVE',
            severity: 'MEDIUM',
            evidence: item,
            deterministicReason: 'Positive credit rating keyword detected (upgrade, reaffirmed).',
          };
        }
        return {
          signal: 'CREDIT_DEBT_EVENT_PRESENT',
          polarity: 'MIXED',
          severity: 'MEDIUM',
          evidence: item,
          deterministicReason: 'Credit/debt event present but polarity is indeterminate.',
        };

      case 'CORPORATE_ACTION':
        return {
          signal: 'CORPORATE_ACTION_PRESENT',
          polarity: 'MIXED',
          severity: 'LOW',
          evidence: item,
          deterministicReason: 'Corporate action event present as a watch item.',
        };

      case 'INSIDER_DEAL':
        if (item.rawType === 'insider_deals' && textLower.includes('sell')) {
          if (textLower.includes('high value') || textLower.includes('significant')) {
            return {
              signal: 'INSIDER_SELLING_PRESENT',
              polarity: 'NEGATIVE',
              severity: 'HIGH',
              evidence: item,
              deterministicReason: 'High-value insider selling detected.',
            };
          }
          return {
            signal: 'INSIDER_SELLING_PRESENT',
            polarity: 'MIXED',
            severity: 'MEDIUM',
            evidence: item,
            deterministicReason: 'Routine insider selling detected.',
          };
        }
        return {
          signal: 'SAST_OR_BULK_DEAL_PRESENT',
          polarity: 'MIXED',
          severity: 'MEDIUM',
          evidence: item,
          deterministicReason: 'SAST/Bulk deal present. Check for ownership changes.',
        };

      case 'GOVERNANCE_EVENT':
        return {
          signal: 'GOVERNANCE_REVIEW_REQUIRED',
          polarity: 'MIXED',
          severity: 'MEDIUM',
          evidence: item,
          deterministicReason: 'Governance event detected.',
        };

      case 'DOCUMENT':
        return {
          signal: 'DOCUMENT_SUPPORT_AVAILABLE',
          polarity: 'SUPPORTIVE',
          severity: 'LOW',
          evidence: item,
          deterministicReason: 'Source documents available for evidence coverage.',
        };

      case 'SECTOR_CONTEXT':
        return {
          signal: 'SECTOR_CLASSIFIED',
          polarity: 'MIXED',
          severity: 'LOW',
          evidence: item,
          deterministicReason: 'Sector context available.',
        };

      default:
        return null;
    }
  }

  // Specialized rule for promoter pledge as it's a numeric fact normally
  // but can be converted to a QualitativeSignal for unified handling.
  public classifyPromoterPledge(
    pledgeValue: number,
    item: QualitativeEvidenceItem
  ): QualitativeSignal {
    if (pledgeValue > 15) {
      return {
        signal: 'PROMOTER_PLEDGE_RISK',
        polarity: 'NEGATIVE',
        severity: 'HIGH',
        evidence: item,
        deterministicReason: `Promoter pledge is high (${pledgeValue}%).`,
      };
    }
    if (pledgeValue > 0) {
      return {
        signal: 'PROMOTER_PLEDGE_RISK',
        polarity: 'MIXED',
        severity: 'MEDIUM',
        evidence: item,
        deterministicReason: `Promoter pledge is present (${pledgeValue}%).`,
      };
    }
    return {
      signal: 'PROMOTER_PLEDGE_RISK',
      polarity: 'SUPPORTIVE',
      severity: 'LOW',
      evidence: item,
      deterministicReason: 'Zero promoter pledge.',
    };
  }
}
