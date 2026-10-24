/**
 * src/server/services/EvidenceEnvelopeService.ts
 * Main service for creating and managing evidence envelopes
 */

import { TimestampService } from './TimestampService.js';

export interface EvidenceSource {
  type: string;
  name: string;
  timestamp: string;
  reliability: number;
}

export interface ProvChainHop {
  service: string;
  timestamp: string;
  cacheHit: boolean;
}

export interface EvidenceEnvelope {
  urls: string[];
  timestamp: string;
  confidence: number;
  sources: EvidenceSource[];
  error_source?: string;
  is_stale?: boolean;
  expiry_time?: string;
  chain?: ProvChainHop[];
}

export interface ResponseEnvelope {
  evidence: EvidenceEnvelope;
  data?: any;
}

export class EvidenceEnvelopeService {
  private static instance: EvidenceEnvelopeService;
  private tsService = TimestampService.getInstance();

  static getInstance(): EvidenceEnvelopeService {
    if (!EvidenceEnvelopeService.instance) {
      EvidenceEnvelopeService.instance = new EvidenceEnvelopeService();
    }
    return EvidenceEnvelopeService.instance;
  }

  createEnvelope(data: any, evidence: EvidenceEnvelope): ResponseEnvelope {
    // Validate evidence structure
    const validatedEvidence: EvidenceEnvelope = {
      urls: evidence.urls || [],
      timestamp: evidence.timestamp || this.tsService.getCurrentTimestamp(),
      confidence: evidence.confidence ?? 0,
      sources: evidence.sources || [],
      ...evidence
    };

    return {
      evidence: validatedEvidence,
      data
    };
  }

  createEnvelopeWithChain(data: any, evidence: EvidenceEnvelope & { chain: ProvChainHop[] }): ResponseEnvelope {
    const envelope = this.createEnvelope(data, evidence);
    if (evidence.chain) {
      envelope.evidence.chain = evidence.chain;
    }
    return envelope;
  }

  createErrorEnvelope(error: Error, statusCode: number, evidence: EvidenceEnvelope): ResponseEnvelope {
    const errorEvidence: EvidenceEnvelope = {
      urls: evidence.urls || [],
      timestamp: evidence.timestamp || this.tsService.getCurrentTimestamp(),
      confidence: evidence.confidence ?? 0,
      sources: evidence.sources || [],
      error_source: error.message,
      is_stale: evidence.is_stale,
      expiry_time: evidence.expiry_time,
      chain: evidence.chain
    };

    return {
      evidence: errorEvidence,
      data: undefined
    };
  }

  markStale(evidence: EvidenceEnvelope): EvidenceEnvelope {
    return {
      ...evidence,
      is_stale: true
    };
  }
}
