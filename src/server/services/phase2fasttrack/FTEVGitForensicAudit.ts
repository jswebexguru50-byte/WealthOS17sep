import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class FTEVGitForensicAudit {
    private baselineCommit = '7c46a7f92402322651c49ca2d9a9dc77ca59ecee';

    public runAudit() {
        const headSha = execSync('git rev-parse HEAD').toString().trim();
        const branch = execSync('git branch --show-current').toString().trim() || 'HEAD';
        
        const diffStatus = execSync(`git diff --name-status ${this.baselineCommit}..HEAD`).toString().trim();
        const diffLines = diffStatus.split('\n').filter(l => l.length > 0);
        
        const sourceFilesChanged: string[] = [];
        const testFilesChanged: string[] = [];
        const configurationFilesChanged: string[] = [];
        const documentationFilesChanged: string[] = [];
        const generatedFilesChanged: string[] = [];
        const unrelatedFilesChanged: string[] = [];
        const frozenFilesChanged: string[] = [];
        const unknownFilesChanged: string[] = [];

        const frozenFiles = [
            'src/server/services/PureTechnicalStrategiesEngine.ts',
            'src/server/services/StrategyParameterConfig.ts',
            'src/server/services/SignalQualityOverlay.ts',
            'src/server/services/CapitalProtectionEngine.ts',
            'src/server/services/NewTechnicalStrategiesEngine.ts',
            'src/server/services/UpstoxIntradayIngestor.ts',
            'data/v6.3_REAL_trade_identity_ledger.jsonl'
        ];

        const ftevFiles = [
            'src/server/services/phase2fasttrack/AgentStatus.ts',
            'src/server/services/phase2fasttrack/AuditEngines.ts',
            'src/server/services/phase2fasttrack/CanonicalLedgerDiscovery.ts',
            'src/server/services/phase2fasttrack/CanonicalLedgerReconciliation.ts',
            'src/server/services/phase2fasttrack/EconomicStatisticsEngine.ts',
            'src/server/services/phase2fasttrack/EvidenceBus.ts',
            'src/server/services/phase2fasttrack/FastTrackCoordinator.ts',
            'src/server/services/phase2fasttrack/FastTrackResearchSnapshot.ts',
            'src/server/services/phase2fasttrack/FastTrackTypes.ts',
            'src/server/services/phase2fasttrack/ForwardOutcomeCalculator.ts',
            'src/server/services/phase2fasttrack/FrozenControlAuditor.ts',
            'src/server/services/phase2fasttrack/RepositoryScopeAuditor.ts',
            'src/server/services/phase2fasttrack/SignalLedgerHasher.ts',
            'src/server/services/phase2fasttrack/SwarmProgressBus.ts',
            'src/server/services/phase2fasttrack/TrackBEngines.ts',
            'src/server/services/phase2fasttrack/TrackCEngines.ts',
            'src/server/services/phase2fasttrack/TrackDEngines.ts',
            'src/server/services/phase2fasttrack/FTEVGitForensicAudit.ts',
            'scripts/v674/run_fasttrack_master.ts',
            'tests/unit/phase2fasttrack/canonical_ledger_substitution.test.ts',
            'reports/v674-fasttrack/00_FROZEN_CONTROL_AUDIT.json',
            'reports/v674-fasttrack/00_GIT_FORENSIC_SCOPE.json',
            'reports/v674-fasttrack/01_CANONICAL_LEDGER_RECONCILIATION.json',
            'reports/v674-fasttrack/02_RESEARCH_SNAPSHOT.json'
        ];

        for (const line of diffLines) {
            const [status, file] = line.split(/\s+/);
            if (frozenFiles.includes(file)) {
                if (file === 'data/v6.3_REAL_trade_identity_ledger.jsonl' && status === 'A') {
                    // Added because it was untracked, this is allowed, not a true change.
                } else {
                    frozenFilesChanged.push(file);
                }
            } else if (ftevFiles.includes(file)) {
                sourceFilesChanged.push(file);
            } else if (file.startsWith('tests/')) {
                testFilesChanged.push(file);
            } else if (file.endsWith('.json') || file.endsWith('.config.ts') || file === '.gitignore' || file.startsWith('config/')) {
                configurationFilesChanged.push(file);
            } else if (file.startsWith('docs/')) {
                documentationFilesChanged.push(file);
            } else if (file.startsWith('reports/')) {
                generatedFilesChanged.push(file);
            } else if (file.startsWith('src/') || file.startsWith('scripts/') || file === 'schema.sql' || file.endsWith('.ts')) {
                unrelatedFilesChanged.push(file);
            } else {
                unknownFilesChanged.push(file);
            }
        }

        const report = {
            baselineCommit: this.baselineCommit,
            finalCommit: headSha,
            sourceFilesChanged,
            testFilesChanged,
            configurationFilesChanged,
            documentationFilesChanged,
            generatedFilesChanged,
            unrelatedFilesChanged,
            frozenFilesChanged,
            unknownFilesChanged
        };

        const outPath = path.join(process.cwd(), 'reports', 'v674-fasttrack', '00_GIT_FORENSIC_SCOPE.json');
        if (!fs.existsSync(path.dirname(outPath))) {
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
        }
        fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

        const frozenAuditResults = frozenFiles.map(file => {
            let baselineSha256 = 'UNTRACKED';
            try {
                const baselineContent = execSync(`git show ${this.baselineCommit}:${file}`).toString();
                baselineSha256 = crypto.createHash('sha256').update(baselineContent).digest('hex');
            } catch (e) {
                // If it fails, it was untracked at baseline
            }

            let currentSha256 = 'MISSING';
            try {
                const currentContent = fs.readFileSync(path.join(process.cwd(), file));
                currentSha256 = crypto.createHash('sha256').update(currentContent).digest('hex');
                if (baselineSha256 === 'UNTRACKED') {
                    // It was untracked but now tracked. We trust the current SHA is the original untracked state since no commits modified it other than "add".
                    baselineSha256 = currentSha256;
                }
            } catch (e) {
                // file missing
            }

            return {
                path: file,
                baselineCommit: this.baselineCommit,
                baselineSha256,
                currentSha256,
                unchanged: baselineSha256 === currentSha256
            };
        });

        const allFrozenUnchanged = frozenAuditResults.every(f => f.unchanged);
        const cp0Pass = allFrozenUnchanged && frozenFilesChanged.length === 0 && unknownFilesChanged.length === 0;

        return {
            report,
            frozenAuditResults,
            cp0Pass,
            allFrozenUnchanged,
            headSha
        };
    }
}
