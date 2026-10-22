import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DependencyViolation {
  file: string;
  forbiddenImport: string;
  line: number;
}

export class S1101RDependencyFirewall {
  private static FORBIDDEN_IMPORTS = [
    'PureTechnicalStrategiesEngine',
    'NewTechnicalStrategiesEngine',
    'SignalQualityOverlay',
    'v6.3_REAL_trade_identity_ledger',
    'productionSignalCache',
    'trade_identity_ledger',
  ];

  public scanDirectory(cleanRoomDir: string): DependencyViolation[] {
    const violations: DependencyViolation[] = [];
    if (!fs.existsSync(cleanRoomDir)) return violations;

    const files = fs.readdirSync(cleanRoomDir).filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
    for (const f of files) {
      const fullPath = path.join(cleanRoomDir, f);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('import ') || line.includes('require(')) {
          for (const forbidden of S1101RDependencyFirewall.FORBIDDEN_IMPORTS) {
            if (line.includes(forbidden)) {
              violations.push({
                file: f,
                forbiddenImport: forbidden,
                line: i + 1,
              });
            }
          }
        }
      }
    }

    return violations;
  }
}
