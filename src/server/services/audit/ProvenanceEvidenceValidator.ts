/**
 * src/server/services/audit/ProvenanceEvidenceValidator.ts
 *
 * WealthOS v6.7.2 Cryptographic Data Provenance & Lineage Validator.
 *
 * Validates immutable end-to-end data lineage across all canonical domains:
 * OHLCV, corporate actions, fundamentals, shareholding, smart money, delivery,
 * index membership, index data, derivatives, and valuation metrics.
 *
 * Emits PROVENANCE_INCOMPLETE upon missing fields or disconnected transformation chains.
 */

import crypto from 'node:crypto';

export type ProvenanceDomain =
  | 'OHLCV'
  | 'CORPORATE_ACTIONS'
  | 'FUNDAMENTALS'
  | 'SHAREHOLDING'
  | 'SMART_MONEY'
  | 'DELIVERY'
  | 'INDEX_MEMBERSHIP'
  | 'INDEX_DATA'
  | 'DERIVATIVES'
  | 'VALUATION';

export interface TransformationStep {
  stepId: string;
  operation: string;
  appliedAt: string;
  inputHash: string;
  outputHash: string;
}

export interface ProvenanceRecord {
  domain: ProvenanceDomain;
  securityId: string;
  sourceId: string;
  sourceVersion: string;
  provider: string;
  retrievedAt: string;
  availableAt: string;
  rawHash: string;
  normalizedHash: string;
  identityHash: string;
  transformationChain: TransformationStep[];
}

export interface ProvenanceValidationResult {
  valid: boolean;
  status: 'PASS' | 'PROVENANCE_INCOMPLETE' | 'HASH_CHAIN_CORRUPTED';
  missingDomains: ProvenanceDomain[];
  recordsValidated: number;
  failureReasons: string[];
  manifestHash: string;
}

export class ProvenanceEvidenceValidator {
  private static readonly REQUIRED_DOMAINS: ProvenanceDomain[] = [
    'OHLCV',
    'CORPORATE_ACTIONS',
    'FUNDAMENTALS',
    'SHAREHOLDING',
    'SMART_MONEY',
    'DELIVERY',
    'INDEX_MEMBERSHIP',
    'INDEX_DATA',
    'DERIVATIVES',
    'VALUATION'
  ];

  public validateProvenance(records: ProvenanceRecord[]): ProvenanceValidationResult {
    const presentDomains = new Set(records.map(r => r.domain));
    const missingDomains = ProvenanceEvidenceValidator.REQUIRED_DOMAINS.filter(d => !presentDomains.has(d));
    const failureReasons: string[] = [];

    if (missingDomains.length > 0) {
      failureReasons.push(`Missing provenance coverage for domains: ${missingDomains.join(', ')}`);
    }

    for (const rec of records) {
      // Validate mandatory fields
      if (!rec.sourceId || !rec.sourceVersion || !rec.provider || !rec.retrievedAt || !rec.availableAt) {
        failureReasons.push(`Incomplete metadata in record for domain ${rec.domain}: missing mandatory source headers.`);
      }

      if (!rec.rawHash || !rec.normalizedHash || !rec.identityHash) {
        failureReasons.push(`Cryptographic hashes incomplete for record in domain ${rec.domain}.`);
      }

      // Validate transformation chain continuity
      if (!rec.transformationChain || rec.transformationChain.length === 0) {
        failureReasons.push(`Missing transformation chain for domain ${rec.domain}.`);
      } else {
        let currentHash = rec.rawHash;
        for (let i = 0; i < rec.transformationChain.length; i++) {
          const step = rec.transformationChain[i];
          if (step.inputHash !== currentHash) {
            failureReasons.push(`Broken transformation chain in domain ${rec.domain} at step ${step.stepId}.`);
          }
          currentHash = step.outputHash;
        }
        if (currentHash !== rec.normalizedHash) {
          failureReasons.push(`Transformation chain end hash does not match normalizedHash in domain ${rec.domain}.`);
        }
      }
    }

    const manifestHash = crypto.createHash('sha256')
      .update(JSON.stringify(records.map(r => ({ domain: r.domain, rawHash: r.rawHash, norm: r.normalizedHash }))))
      .digest('hex');

    const valid = failureReasons.length === 0 && missingDomains.length === 0;

    return {
      valid,
      status: valid ? 'PASS' : 'PROVENANCE_INCOMPLETE',
      missingDomains,
      recordsValidated: records.length,
      failureReasons,
      manifestHash
    };
  }

  /**
   * Generates standard canonical provenance records for testing and baseline validation.
   */
  public generateCanonicalProvenance(): ProvenanceRecord[] {
    return ProvenanceEvidenceValidator.REQUIRED_DOMAINS.map(domain => {
      const rawHash = crypto.createHash('sha256').update(`RAW_${domain}_CANONICAL_2020_2026`).digest('hex');
      const normHash = crypto.createHash('sha256').update(`NORM_${domain}_CANONICAL_2020_2026`).digest('hex');
      const identityHash = crypto.createHash('sha256').update(`ID_${domain}_NSE`).digest('hex');

      return {
        domain,
        securityId: 'NIFTY500_UNIVERSE',
        sourceId: `NSE_${domain}_FEED_V1`,
        sourceVersion: '1.0.0',
        provider: 'NSE_HISTORICAL_ARCHIVE',
        retrievedAt: '2026-09-17T00:00:00.000Z',
        availableAt: '2020-02-27T18:00:00.000Z',
        rawHash,
        normalizedHash: normHash,
        identityHash,
        transformationChain: [
          {
            stepId: 'INGEST',
            operation: 'BINARY_DECODE',
            appliedAt: '2026-09-17T00:01:00.000Z',
            inputHash: rawHash,
            outputHash: normHash
          }
        ]
      };
    });
  }
}
