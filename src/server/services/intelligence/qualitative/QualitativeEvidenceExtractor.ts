import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';

export type QualitativeEvidenceItem = {
  id: string;
  category:
    | 'BUSINESS_DESCRIPTION'
    | 'MANAGEMENT_CHANGE'
    | 'CREDIT_DEBT_EVENT'
    | 'GOVERNANCE_EVENT'
    | 'CORPORATE_ACTION'
    | 'INSIDER_DEAL'
    | 'DOCUMENT'
    | 'SECTOR_CONTEXT';
  text: string;
  eventDate: string | null;
  provider: string;
  sourceDocumentId: string | null;
  sourceUrl?: string | null;
  rawType?: string | null;
};

export type QualitativeEvidenceBundle = {
  symbol: string;
  businessDescription: QualitativeEvidenceItem | null;
  managementEvents: QualitativeEvidenceItem[];
  creditDebtEvents: QualitativeEvidenceItem[];
  governanceEvents: QualitativeEvidenceItem[];
  corporateActions: QualitativeEvidenceItem[];
  insiderDealEvents: QualitativeEvidenceItem[];
  documentEvidence: QualitativeEvidenceItem[];
  sectorContext: QualitativeEvidenceItem | null;
};

export class QualitativeEvidenceExtractor {
  private static instance: QualitativeEvidenceExtractor;
  private factRepo: CanonicalFactRepository;

  private constructor(factRepo = CanonicalFactRepository.getInstance()) {
    this.factRepo = factRepo;
  }

  public static getInstance(): QualitativeEvidenceExtractor {
    if (!QualitativeEvidenceExtractor.instance) {
      QualitativeEvidenceExtractor.instance = new QualitativeEvidenceExtractor();
    }
    return QualitativeEvidenceExtractor.instance;
  }

  private mapToItem(
    fact: CanonicalFact,
    category: QualitativeEvidenceItem['category']
  ): QualitativeEvidenceItem | null {
    if (typeof fact.value !== 'string' || !fact.value.trim()) return null;

    return {
      id: fact.factId,
      category,
      text: fact.value.trim(),
      eventDate: fact.periodEnd || fact.publishedAt || null,
      provider: fact.sourceId || 'UNKNOWN',
      sourceDocumentId: fact.sourceId || null,
      rawType: fact.metric,
    };
  }

  public async extract(
    identity: SecurityIdentity,
    asOfDate?: string
  ): Promise<QualitativeEvidenceBundle> {
    const facts = await this.factRepo.getLatestFactsByMetric(identity, asOfDate);

    const bundle: QualitativeEvidenceBundle = {
      symbol: identity.nseSymbol || identity.securityId,
      businessDescription: null,
      managementEvents: [],
      creditDebtEvents: [],
      governanceEvents: [],
      corporateActions: [],
      insiderDealEvents: [],
      documentEvidence: [],
      sectorContext: null,
    };

    if (facts['business_description']) {
      bundle.businessDescription = this.mapToItem(facts['business_description'], 'BUSINESS_DESCRIPTION');
    }

    if (facts['management_changes']) {
      const item = this.mapToItem(facts['management_changes'], 'MANAGEMENT_CHANGE');
      if (item) bundle.managementEvents.push(item);
    }

    if (facts['credit_debt_events']) {
      const item = this.mapToItem(facts['credit_debt_events'], 'CREDIT_DEBT_EVENT');
      if (item) bundle.creditDebtEvents.push(item);
    }

    if (facts['governance_events']) {
      const item = this.mapToItem(facts['governance_events'], 'GOVERNANCE_EVENT');
      if (item) bundle.governanceEvents.push(item);
    }

    if (facts['corporate_actions']) {
      const item = this.mapToItem(facts['corporate_actions'], 'CORPORATE_ACTION');
      if (item) bundle.corporateActions.push(item);
    }

    if (facts['insider_deals'] || facts['sast_deals'] || facts['bulk_deals']) {
      for (const m of ['insider_deals', 'sast_deals', 'bulk_deals']) {
        if (facts[m]) {
          const item = this.mapToItem(facts[m], 'INSIDER_DEAL');
          if (item) bundle.insiderDealEvents.push(item);
        }
      }
    }
    
    if (facts['document_links']) {
      const item = this.mapToItem(facts['document_links'], 'DOCUMENT');
      if (item) bundle.documentEvidence.push(item);
    }
    
    if (facts['sector_context']) {
      bundle.sectorContext = this.mapToItem(facts['sector_context'], 'SECTOR_CONTEXT');
    }

    return bundle;
  }
}
