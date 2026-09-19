/**
 * WealthOS v6.6–v6.7 - Reference Audit Ledger
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Maintains a tamper-evident, cryptographic hash-chained event log:
 * data/reference/reference_audit_ledger.jsonl
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type ReferenceAuditEventType =
  | 'REFERENCE_REGISTERED'
  | 'REFERENCE_REQUESTED'
  | 'REFERENCE_RESPONSE_RECEIVED'
  | 'REFERENCE_PARITY_COMPLETED'
  | 'REFERENCE_DISCREPANCY_DETECTED'
  | 'REFERENCE_CANDIDATE_CREATED'
  | 'REFERENCE_VERSION_PINNED';

export interface ReferenceAuditEvent {
  eventId: string;
  eventType: ReferenceAuditEventType;
  runId: string;
  provider: string;
  providerVersion: string;
  timestamp: string;
  securityId?: string;
  capabilityId?: string;
  inputHash?: string;
  outputHash?: string;
  previousEventHash?: string;
  eventHash: string;
}

export class ReferenceAuditLedger {
  private static instance: ReferenceAuditLedger;
  private readonly ledgerPath: string;
  private lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

  private constructor() {
    const root = process.cwd();
    this.ledgerPath = path.join(root, 'data', 'reference', 'reference_audit_ledger.jsonl');
    this.ensureDir();
    this.loadLastHash();
  }

  public static getInstance(): ReferenceAuditLedger {
    if (!ReferenceAuditLedger.instance) {
      ReferenceAuditLedger.instance = new ReferenceAuditLedger();
    }
    return ReferenceAuditLedger.instance;
  }

  private ensureDir(): void {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadLastHash(): void {
    if (!fs.existsSync(this.ledgerPath)) return;
    const lines = fs.readFileSync(this.ledgerPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      try {
        const last: ReferenceAuditEvent = JSON.parse(lines[lines.length - 1]);
        if (last.eventHash) this.lastHash = last.eventHash;
      } catch (e) {
        // ignore
      }
    }
  }

  public recordEvent(
    params: Omit<ReferenceAuditEvent, 'eventId' | 'timestamp' | 'previousEventHash' | 'eventHash'>
  ): ReferenceAuditEvent {
    const eventId = `REFEVT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const previousEventHash = this.lastHash;

    const preImage = JSON.stringify({
      eventId,
      eventType: params.eventType,
      runId: params.runId,
      provider: params.provider,
      providerVersion: params.providerVersion,
      timestamp,
      securityId: params.securityId,
      capabilityId: params.capabilityId,
      inputHash: params.inputHash,
      outputHash: params.outputHash,
      previousEventHash
    });

    const eventHash = crypto.createHash('sha256').update(preImage).digest('hex');
    const fullEvent: ReferenceAuditEvent = {
      ...params,
      eventId,
      timestamp,
      previousEventHash,
      eventHash
    };

    fs.appendFileSync(this.ledgerPath, JSON.stringify(fullEvent) + '\n', 'utf8');
    this.lastHash = eventHash;
    return fullEvent;
  }
}
