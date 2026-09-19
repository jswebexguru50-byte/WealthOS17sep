import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class R4ResearchContaminationDetector {
  public static runAdversarialAudit(baseDir: string = process.cwd()): {
    attacksTested: Record<string, any>;
    allProtected: boolean;
  } {
    const attacksTested: Record<string, any> = {};

    // Attack 1: Frozen Controls Tampering
    const manifestPath = path.resolve(baseDir, 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    let tamperedControls = 0;
    for (const art of manifest.artifacts) {
      const fullP = path.resolve(baseDir, art.path);
      const content = fs.readFileSync(fullP);
      const sha = crypto.createHash('sha256').update(content).digest('hex');
      if (sha !== art.sha256) tamperedControls++;
    }
    attacksTested['FROZEN_CONTROLS_TAMPERING'] = {
      attackType: 'UNAUTHORIZED_MUTATION_OF_S1_S20_OR_V63_CONTROLS',
      tamperedFilesFound: tamperedControls,
      status: tamperedControls === 0 ? 'PROTECTED_PASS' : 'BREACH_STOP_THE_LINE'
    };

    // Attack 2: Production Promotion Lock Bypass
    const progressPath = path.resolve(baseDir, 'reports/v674-r4/R4_PROGRESS.json');
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    const prodAuth = progress.productionPromotionAuthorization === true;
    const liveTrade = progress.liveTrading === true;
    attacksTested['PRODUCTION_LOCK_BYPASS'] = {
      attackType: 'AUTOMATIC_PROMOTION_OR_LIVE_TRADING_AUTHORIZATION',
      productionPromotionEnabled: prodAuth,
      liveTradingEnabled: liveTrade,
      status: (!prodAuth && !liveTrade) ? 'PROTECTED_PASS' : 'BREACH_STOP_THE_LINE'
    };

    // Attack 3: Runtime Randomness & Nondeterminism Scan
    const scanDirs = ['src/server/services/research/r4', 'scripts/v674'];
    let randomnessFound = 0;
    for (const d of scanDirs) {
      const fullD = path.resolve(baseDir, d);
      if (!fs.existsSync(fullD)) continue;
      const files = fs.readdirSync(fullD).filter(f => f.endsWith('.ts') && f !== 'R4ResearchContaminationDetector.ts');
      for (const f of files) {
        const lines = fs.readFileSync(path.join(fullD, f), 'utf-8').split('\n');
        for (const line of lines) {
          if (line.includes('Math.random()') || line.includes('crypto.randomUUID()')) {
            randomnessFound++;
          }
        }
      }
    }
    attacksTested['RUNTIME_RANDOMNESS_INJECTION'] = {
      attackType: 'NONDETERMINISTIC_RANDOM_CALLS',
      occurrencesFound: randomnessFound,
      status: randomnessFound === 0 ? 'PROTECTED_PASS' : 'BREACH_STOP_THE_LINE'
    };

    // Attack 4: Temporal Lookahead Injection in Replay
    const pitPath = path.resolve(baseDir, 'reports/v674-r4/R4_PIT_AUDIT.json');
    const pit = JSON.parse(fs.readFileSync(pitPath, 'utf-8'));
    const lookaheadCount = pit.checks.temporalLeakage.violationsFound;
    attacksTested['TEMPORAL_LOOKAHEAD_INJECTION'] = {
      attackType: 'FUTURE_DATA_CONTAMINATION',
      violationsFound: lookaheadCount,
      status: lookaheadCount === 0 ? 'PROTECTED_PASS' : 'BREACH_STOP_THE_LINE'
    };

    // Attack 5: Selective Experiment Cherry-Picking (BH-FDR Denominator)
    const predecl = JSON.parse(fs.readFileSync(path.resolve(baseDir, 'reports/v674-r4/R4_PREDECLARATION.json'), 'utf-8'));
    const stats = JSON.parse(fs.readFileSync(path.resolve(baseDir, 'reports/v674-r4/R4_STATISTICS.json'), 'utf-8'));
    const declaredCount = predecl.experimentsCount;
    const evaluatedCount = stats.familySizeDenominator;
    attacksTested['SELECTIVE_CHERRY_PICKING'] = {
      attackType: 'EXCLUSION_OF_UNFAVORABLE_HYPOTHESES_FROM_FDR_DENOMINATOR',
      predeclaredHypothesesCount: declaredCount,
      testedDenominatorCount: evaluatedCount,
      omissionsDetected: Math.abs(declaredCount - evaluatedCount),
      status: declaredCount === evaluatedCount ? 'PROTECTED_PASS' : 'BREACH_STOP_THE_LINE'
    };

    const allProtected = Object.values(attacksTested).every((a: any) => a.status === 'PROTECTED_PASS');
    return { attacksTested, allProtected };
  }
}
