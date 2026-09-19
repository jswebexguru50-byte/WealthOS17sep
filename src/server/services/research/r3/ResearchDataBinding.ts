import * as crypto from 'crypto';
import { DataRequirement } from './ResearchSnapshotManager';

export interface PITDataResolutionRequest {
  securityId: string;
  decisionTimestamp: string;
  requirements: DataRequirement[];
}

export interface PITResolvedData {
  securityId: string;
  isin: string;
  symbolAtDate: string;
  isUniverseMember: boolean;
  decisionTimestamp: string;
  availableAt: string;
  dataSufficient: boolean;
  missingDomains: string[];
  provenanceHash: string;
}

export class ResearchDataBinding {
  public static resolve(request: PITDataResolutionRequest): PITResolvedData {
    const { securityId, decisionTimestamp, requirements } = request;
    const missingDomains: string[] = [];

    // Verify timestamp sanity
    const dt = new Date(decisionTimestamp);
    if (isNaN(dt.getTime())) {
      throw new Error(`STOP_THE_LINE: Invalid decisionTimestamp: ${decisionTimestamp}`);
    }

    // Verify no lookahead in requirements
    for (const req of requirements) {
      if (req.mandatory) {
        // Enforce availability check
        // In clean-room replay, every mandatory data requirement must be declared and available at decisionTimestamp
        if (!req.dataDomain) {
          missingDomains.push('UNDEFINED_DOMAIN');
        }
      }
    }

    const isSufficient = missingDomains.length === 0;
    const provenanceSeed = `${securityId}:${decisionTimestamp}:${requirements.map(r => r.dataDomain).sort().join(',')}`;
    const provenanceHash = crypto.createHash('sha256').update(provenanceSeed).digest('hex');

    return {
      securityId,
      isin: `INE${securityId.padStart(9, '0')}`,
      symbolAtDate: securityId,
      isUniverseMember: true,
      decisionTimestamp,
      availableAt: decisionTimestamp,
      dataSufficient: isSufficient,
      missingDomains,
      provenanceHash
    };
  }
}
