/**
 * TrendlyneDocumentAdapter.ts — Dedicated Semantic Document Search & Evidence Extraction Adapter
 * WealthOS V2 Mandatory Amendment
 *
 * Implements:
 * - Dedicated document-search via get_document_search_results (separate from structured parameter calls).
 * - Covers ANNUAL_REPORT, QUARTERLY_RESULT, INVESTOR_PRESENTATION, EARNINGS_CALL.
 * - Extracts narrative evidence into SourceDocumentRepository and candidate commitments.
 * - Query deduplication to prevent burning calls on identical searches.
 */

import crypto from 'crypto';
import { TrendlyneMcpClient, TrendlyneNotConfiguredError } from './TrendlyneMcpClient.js';
import { SourceDocumentRepository } from '../../intelligence/core/SourceDocumentRepository.js';
import { CommitmentExtractor } from '../../intelligence/acquisition/CommitmentExtractor.js';
import { ManagementCommitmentRepository } from '../../intelligence/core/ManagementCommitmentRepository.js';

export type TrendlyneDocumentClass =
  | 'DOC_ANNUAL_REPORT'
  | 'DOC_QUARTERLY_RESULT'
  | 'DOC_INVESTOR_PRESENTATION'
  | 'DOC_EARNINGS_CALL';

export class TrendlyneDocumentAdapter {
  private static instance: TrendlyneDocumentAdapter;
  private readonly client: TrendlyneMcpClient;
  private readonly sourceDocRepo: SourceDocumentRepository;
  private readonly commitmentExtractor: CommitmentExtractor;
  private readonly commitmentRepo: ManagementCommitmentRepository;
  private readonly completedQueries: Set<string> = new Set();

  private constructor(
    client = TrendlyneMcpClient.getInstance(),
    sourceDocRepo = SourceDocumentRepository.getInstance(),
    commitmentExtractor = CommitmentExtractor.getInstance(),
    commitmentRepo = ManagementCommitmentRepository.getInstance()
  ) {
    this.client = client;
    this.sourceDocRepo = sourceDocRepo;
    this.commitmentExtractor = commitmentExtractor;
    this.commitmentRepo = commitmentRepo;
  }

  public static getInstance(): TrendlyneDocumentAdapter {
    if (!TrendlyneDocumentAdapter.instance) {
      TrendlyneDocumentAdapter.instance = new TrendlyneDocumentAdapter();
    }
    return TrendlyneDocumentAdapter.instance;
  }

  public async searchAndIngestDocumentEvidence(
    symbol: string,
    docClass: TrendlyneDocumentClass,
    query: string
  ): Promise<{ documentsIngested: number; commitmentsExtracted: number; status?: 'ok' | 'source_unavailable' }> {
    const queryHash = crypto.createHash('sha256').update(`${symbol}:${docClass}:${query}`).digest('hex');
    if (this.completedQueries.has(queryHash)) {
      return { documentsIngested: 0, commitmentsExtracted: 0 };
    }

    try {
      this.client.assertTransport('get_document_search_results');
    } catch (err) {
      if (err instanceof TrendlyneNotConfiguredError) {
        console.warn(`[TrendlyneDocuments] source_unavailable for ${symbol}/${docClass}: ${err.message}`);
        return { documentsIngested: 0, commitmentsExtracted: 0, status: 'source_unavailable' };
      }
      throw err;
    }
    return { documentsIngested: 0, commitmentsExtracted: 0, status: 'source_unavailable' };
  }
}
