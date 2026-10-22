/**
 * SourceDocumentRepository.ts — Wave B Source Document Persistence
 *
 * Implements persistent SQLite storage for all raw external documents,
 * filings, and disclosures with strict SHA-256 idempotency.
 *
 * Invariant: Zero runtime DDL statements (table managed by migration 007).
 */

import { getDB, dbAll, dbRun } from '../../../database.js';
import {
  SourceDocument,
  SourceDocumentParseStatus,
  SourceDocumentVerificationStatus,
  SourceDocumentType,
} from '../contracts/SourceDocument.js';

export class SourceDocumentRepository {
  private static instance: SourceDocumentRepository;

  private constructor() {}

  public static getInstance(): SourceDocumentRepository {
    if (!SourceDocumentRepository.instance) {
      SourceDocumentRepository.instance = new SourceDocumentRepository();
    }
    return SourceDocumentRepository.instance;
  }

  public async saveDocument(doc: SourceDocument): Promise<{ doc: SourceDocument; isNew: boolean }> {
    const existing = await this.findByContentHash(doc.contentHash);
    if (existing) {
      return { doc: existing, isNew: false };
    }

    const db = getDB();
    const sql = `
      INSERT INTO source_documents (
        document_id, security_id, symbol, source_type, source_authority,
        title, source_url, published_at, available_at, fetched_at,
        content_hash, local_path, parse_status, verification_status, raw_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const metadataStr = doc.rawMetadata ? JSON.stringify(doc.rawMetadata) : null;

    await dbRun(db, sql, [
      doc.documentId,
      doc.securityId,
      doc.symbol,
      doc.sourceType,
      doc.sourceAuthority,
      doc.title,
      doc.sourceUrl || null,
      doc.publishedAt,
      doc.availableAt,
      doc.fetchedAt,
      doc.contentHash,
      doc.localPath || null,
      doc.parseStatus || 'PENDING',
      doc.verificationStatus || 'UNVERIFIED',
      metadataStr,
    ]);

    return { doc, isNew: true };
  }

  public async findByContentHash(contentHash: string): Promise<SourceDocument | null> {
    const db = getDB();
    const rows = await dbAll<any>(
      db,
      'SELECT * FROM source_documents WHERE content_hash = ? LIMIT 1',
      [contentHash]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapRowToDocument(rows[0]);
  }

  public async findByDocumentId(documentId: string): Promise<SourceDocument | null> {
    const db = getDB();
    const rows = await dbAll<any>(
      db,
      'SELECT * FROM source_documents WHERE document_id = ? LIMIT 1',
      [documentId]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapRowToDocument(rows[0]);
  }

  public async listDocumentsForSecurity(securityId: string): Promise<SourceDocument[]> {
    const db = getDB();
    const rows = await dbAll<any>(
      db,
      'SELECT * FROM source_documents WHERE security_id = ? ORDER BY published_at DESC',
      [securityId]
    );
    return rows.map(r => this.mapRowToDocument(r));
  }

  public async updateParseStatus(
    documentId: string,
    parseStatus: SourceDocumentParseStatus,
    verificationStatus?: SourceDocumentVerificationStatus
  ): Promise<void> {
    const db = getDB();
    if (verificationStatus) {
      await dbRun(
        db,
        'UPDATE source_documents SET parse_status = ?, verification_status = ? WHERE document_id = ?',
        [parseStatus, verificationStatus, documentId]
      );
    } else {
      await dbRun(
        db,
        'UPDATE source_documents SET parse_status = ? WHERE document_id = ?',
        [parseStatus, documentId]
      );
    }
  }

  private mapRowToDocument(row: any): SourceDocument {
    let rawMetadata: Record<string, any> | undefined;
    if (row.raw_metadata) {
      try {
        rawMetadata = JSON.parse(row.raw_metadata);
      } catch {}
    }

    return {
      documentId: row.document_id,
      securityId: row.security_id,
      symbol: row.symbol,
      sourceType: row.source_type as SourceDocumentType,
      sourceAuthority: row.source_authority,
      title: row.title,
      sourceUrl: row.source_url || null,
      publishedAt: row.published_at,
      availableAt: row.available_at,
      fetchedAt: row.fetched_at,
      contentHash: row.content_hash,
      localPath: row.local_path || null,
      parseStatus: row.parse_status as SourceDocumentParseStatus,
      verificationStatus: row.verification_status as SourceDocumentVerificationStatus,
      rawMetadata,
    };
  }
}
