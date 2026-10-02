import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { QglpEngine, QglpAssessment } from '../engines/QglpEngine.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';

export interface FundamentalDossier {
  identity: SecurityIdentity;
  generatedAt: string;
  isComplete: boolean;
  missingData: string[];
  qglpScore: QglpAssessment;
  facts: Record<string, CanonicalFact>;
}

export class FundamentalAnalysisBuilder {
  private static instance: FundamentalAnalysisBuilder;
  private factRepo: CanonicalFactRepository;
  private qglpEngine: QglpEngine;

  private constructor(
    factRepo = CanonicalFactRepository.getInstance(),
    qglpEngine = QglpEngine.getInstance()
  ) {
    this.factRepo = factRepo;
    this.qglpEngine = qglpEngine;
  }

  public static getInstance(): FundamentalAnalysisBuilder {
    if (!FundamentalAnalysisBuilder.instance) {
      FundamentalAnalysisBuilder.instance = new FundamentalAnalysisBuilder();
    }
    return FundamentalAnalysisBuilder.instance;
  }

  public async buildDossier(identity: SecurityIdentity, asOfDate?: string): Promise<FundamentalDossier> {
    const latestFacts = await this.factRepo.getLatestFactsByMetric(identity, asOfDate);
    const qglpScore = await this.qglpEngine.evaluate(identity, asOfDate);

    return {
      identity,
      generatedAt: new Date().toISOString(),
      isComplete: qglpScore.missingCriticalInputs.length === 0,
      missingData: qglpScore.missingCriticalInputs,
      qglpScore,
      facts: latestFacts,
    };
  }
}
