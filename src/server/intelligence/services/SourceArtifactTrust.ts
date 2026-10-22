import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface SourceArtifact {
  sourceId: string;
  issuerSymbol: string;
  isin?: string;
  authority: 'NSE' | 'BSE' | 'MCA' | 'SEBI' | 'CREDIT_RATING_AGENCY' | 'COMPANY_IR' | 'NEWS' | 'SOCIAL' | 'VIDEO' | 'OTHER';
  documentType: string;
  discoveredUrl?: string;
  publicationDate?: string;
  retrievedAt: string;
  httpStatus: number;
  contentType: string;
  localPath: string;
  sha256: string;
  status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
}

export interface AuthenticatedEvidence {
  evidenceId: string;
  sourceId: string;
  issuerSymbol: string;
  quotedText: string;
  documentHash: string;
  extractionMethod: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED';
}

const REPO_ROOT = path.resolve(process.cwd());
const ROOT = path.join(REPO_ROOT, 'data/fere/verified_filings');
const DB_PATH = path.join(ROOT, 'fere_evidence.db');

/** Only this separate trusted store may authenticate live evidence. Legacy EvidenceInventory is excluded. */
export class SourceArtifactTrust {
  public static verifyPersistedBytes(relative: string, sha256: string, quote: string, mime: string, root = ROOT): boolean {
    try {
      if (!relative || path.isAbsolute(relative) || !/^[0-9a-f]{64}$/i.test(sha256) || !quote) return false;
      const archive = realpathSync(path.resolve(root, relative));
      if (!archive.startsWith(realpathSync(root) + path.sep)) return false;
      const bytes = readFileSync(archive);
      if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== sha256) return false;
      if (!/(xml|html|text|json)/.test(mime.toLowerCase()) && !/\.(xml|html|htm|txt|json)$/i.test(archive)) return false;
      return bytes.toString('utf8').includes(quote);
    } catch {
      return false;
    }
  }

  public static verify(evidenceId: string, issuer: string, quote: string): boolean {
    if (!evidenceId || !issuer || !quote || !existsSync(DB_PATH)) return false;
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(DB_PATH, { readOnly: true });
      const row = db.prepare(`SELECT e.evidence_id,e.issuer_symbol,e.quoted_text,e.document_hash,
        e.extraction_method,e.verification_status,d.symbol,d.sha256,d.archive_path,
        d.status,d.content_type
        FROM authenticated_evidence e JOIN filing_document d ON d.id=e.document_id
        WHERE e.evidence_id=?`).get(evidenceId) as Record<string, unknown> | undefined;
      if (!row || row.verification_status !== 'VERIFIED' || row.issuer_symbol !== issuer ||
          row.symbol !== issuer || row.quoted_text !== quote ||
          row.document_hash !== row.sha256 ||
          !['PARSED_PARTIAL', 'ARCHIVED_UNPARSED'].includes(String(row.status))) return false;
      // Text and XBRL are checked against physical bytes. PDF/audio must wait for
      // a separately authenticated deterministic extraction, never a supplied quote.
      const relative = String(row.archive_path || '');
      if (!relative.replaceAll('\\', '/').startsWith('data/fere/verified_filings/archive/')) return false;
      return this.verifyPersistedBytes(relative, String(row.sha256), quote,
        String(row.content_type || ''), REPO_ROOT);
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }
}
