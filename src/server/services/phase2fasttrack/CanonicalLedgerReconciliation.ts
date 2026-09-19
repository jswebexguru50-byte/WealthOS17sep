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
        if (isFirst) {
            isFirst = false;
            continue; // Skip header
        }
        
        const parts = line.split(',');
        if (parts.length < 9) continue;

        const date = parts[0];
        const sym = parts[2].replace(/"/g, '');
        const strat = parts[6];

        signals.push({
            signalId: `SIG-${sym}-${date}-${strat}`,
            strategyId: strat,
            securityId: sym,
            decisionDate: `${date}T15:35:00Z`,
            signal: true,
            parameterValues: {},
            conditionResults: []
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
    let changedRecords = 0;
    let changedFields = 0;
    
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
      changedRecords,
      changedFields,
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
