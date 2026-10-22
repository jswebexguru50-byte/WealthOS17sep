/**
 * src/server/services/phase2fasttrack/CanonicalLedgerReconciliation.ts
 *
 * Reconciles the authoritative canonical ledger against pipeline observations.
 * Preserves canonical identity without synthesizing ad-hoc identifiers.
 * Robustly parses quoted CSV fields and binds directly to canonical provenance hashes.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ImmutableSignal } from './FastTrackTypes';
import { SignalLedgerHasher } from './SignalLedgerHasher';

export class CanonicalLedgerReconciliation {
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = process.cwd();
  }

  /**
   * Parse a CSV line with proper handling of quotes, escaped quotes, and commas.
   */
  public static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  public async parseLedger(filePath: string): Promise<ImmutableSignal[]> {
    if (filePath.endsWith('.json')) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ImmutableSignal[];
    }
    const signals: ImmutableSignal[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });

    let isFirst = true;
    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      if (isFirst) {
        isFirst = false;
        continue; // Skip CSV header
      }

      const parts = CanonicalLedgerReconciliation.parseCsvLine(line.trim());
      if (parts.length < 9) continue;

      const date = parts[0];
      const sessionIndex = parts[1];
      const sym = parts[2];
      const companyName = parts[3];
      const isin = parts[4];
      const sector = parts[5];
      const strat = parts[6];
      const stratName = parts[7];
      const disposition = parts[8];
      const provHash = parts[9] ? parts[9].trim() : '';

      // Authoritative canonical identity: use ProvenanceHash if present, otherwise canonical tuple
      const canonicalId = provHash || `CANONICAL-${isin}-${date}-${strat}-${sessionIndex}`;

      signals.push({
        signalId: canonicalId,
        strategyId: strat,
        securityId: sym,
        pitSecurityId: isin,
        decisionDate: `${date}T00:00:00.000Z`,
        signal: disposition === 'SIGNAL',
        parameterValues: {
          sessionIndex: Number(sessionIndex) || sessionIndex,
          companyName,
          sector,
          strategyName: stratName
        },
        conditionResults: [],
        dataSnapshotHash: provHash,
        codeSha: '',
        datasetHash: provHash,
        provenanceHash: provHash
      });
    }
    return signals;
  }

  public async reconcile(phase23Signals: ImmutableSignal[]): Promise<boolean> {
    const canonicalPath = path.join(this.workspaceRoot, 'reports', 'v674-phase2', '02_CORRECTED_SIGNALS.csv');
    if (!fs.existsSync(canonicalPath)) {
      throw new Error(`Canonical ledger not found at ${canonicalPath}`);
    }

    const phase21Signals = await this.parseLedger(canonicalPath);
    const phase21Records = phase21Signals.length;
    const phase23Records = phase23Signals.length;

    let missingRecords = 0;
    let unexpectedRecords = 0;

    // Hash Phase 2.1
    const phase21Hash = SignalLedgerHasher.hashLedger(phase21Signals);
    // Hash Phase 2.3
    const phase23Hash = SignalLedgerHasher.hashLedger(phase23Signals);

    const phase21Set = new Set(phase21Signals.map(s => SignalLedgerHasher.hashRecord(s)));
    const phase23Set = new Set(phase23Signals.map(s => SignalLedgerHasher.hashRecord(s)));

    for (const hash of phase21Set) {
      if (!phase23Set.has(hash)) missingRecords++;
    }
    for (const hash of phase23Set) {
      if (!phase21Set.has(hash)) unexpectedRecords++;
    }

    const recordLevelMatch = (missingRecords === 0 && unexpectedRecords === 0 && phase21Hash === phase23Hash);
    const status = recordLevelMatch ? 'PASS' : 'FAIL';

    const report = {
      phase21Records,
      phase23Records,
      missingRecords,
      unexpectedRecords,
      phase21Hash,
      phase23Hash,
      recordLevelMatch,
      status
    };

    const outPath = path.join(this.workspaceRoot, 'reports', 'v674-fasttrack', '01_CANONICAL_LEDGER_RECONCILIATION.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    return recordLevelMatch;
  }
}
