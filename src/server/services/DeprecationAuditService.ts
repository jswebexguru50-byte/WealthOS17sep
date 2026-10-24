import { Database } from 'sqlite3';
import { dbAll, dbGet } from '../database.js';

export interface DeprecationTelemetry {
  path: string;
  hit_count_30d: number;
  client_ips: string[];
  browser_user_agents: string[];
  risk_assessment: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface ImplementationVariance {
  timestamp: string;
  legacy_result: any;
  canonical_result: any;
  diff_hash: string;
  variance_detected: boolean;
}

export class DeprecationAuditService {
  private static instance: DeprecationAuditService;

  static getInstance(): DeprecationAuditService {
    if (!DeprecationAuditService.instance) {
      DeprecationAuditService.instance = new DeprecationAuditService();
    }
    return DeprecationAuditService.instance;
  }

  async generateDeprecationReport(db: Database): Promise<DeprecationTelemetry[]> {
    try {
      const records = await dbAll(
        db,
        `SELECT route, COUNT(*) as hit_count, ip, browser_ua
         FROM audit_legacy_path_calls
         WHERE timestamp >= datetime('now', '-30 days')
         GROUP BY route`,
        []
      );

      const telemetry: DeprecationTelemetry[] = [];

      for (const record of records) {
        const hitCount = record.hit_count || 0;
        let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
        let recommendation = 'Can be retired - low usage';

        if (hitCount > 100) {
          riskLevel = 'critical';
          recommendation = 'Extend sunset date - high usage (>100 hits/month)';
        } else if (hitCount > 50) {
          riskLevel = 'high';
          recommendation = 'Plan migration - moderate usage';
        } else if (hitCount > 10) {
          riskLevel = 'medium';
          recommendation = 'Monitor usage - some clients still using';
        }

        telemetry.push({
          path: record.route,
          hit_count_30d: hitCount,
          client_ips: [record.ip],
          browser_user_agents: [record.browser_ua],
          risk_assessment: riskLevel,
          recommendation
        });
      }

      return telemetry;
    } catch (e) {
      // Table may not exist yet
      return [];
    }
  }

  async getOrphanedTestFiles(db: Database): Promise<string[]> {
    // Scan tests/ directory for orphaned test files
    // (This would require file system scanning in a real implementation)
    return [];
  }

  async checkDualRunVariance(db: Database): Promise<ImplementationVariance[]> {
    try {
      const records = await dbAll(
        db,
        `SELECT timestamp, legacy_result, canonical_result, diff_hash, variance_detected
         FROM audit_implementation_variance
         ORDER BY timestamp DESC
         LIMIT 100`,
        []
      );

      return records as ImplementationVariance[];
    } catch (e) {
      // Table may not exist yet
      return [];
    }
  }

  async isSafeToRetireLegacyPath(db: Database, legacyPath: string): Promise<boolean> {
    try {
      const record = await dbGet(
        db,
        `SELECT COUNT(*) as variance_count
         FROM audit_implementation_variance
         WHERE timestamp >= datetime('now', '-7 days')
         AND variance_detected = 1`,
        []
      );

      return (record?.variance_count || 0) === 0;
    } catch (e) {
      return false;
    }
  }

  async generateMigrationGuide(legacyPath: string, canonicalPath: string): Promise<string> {
    const guide = `
# Migration Guide: ${legacyPath} -> ${canonicalPath}

## Old API (Deprecated)
- **Endpoint:** ${legacyPath}
- **Method:** POST/GET
- **Status:** Deprecated

## New API (Canonical)
- **Endpoint:** ${canonicalPath}
- **Method:** POST/GET
- **Status:** Active and recommended

## Parameter Mapping

| Old Parameter | New Parameter | Notes |
|---------------|---------------|-------|
| ticker | symbol | Direct mapping |
| strategy_id | strategy_key | Renamed for clarity |

## Code Example

### Before (Using Legacy)
\`\`\`typescript
const response = await fetch('${legacyPath}', {
  method: 'POST',
  body: JSON.stringify({ ticker: 'INFY' })
});
\`\`\`

### After (Using Canonical)
\`\`\`typescript
const response = await fetch('${canonicalPath}', {
  method: 'POST',
  body: JSON.stringify({ symbol: 'INFY' })
});
\`\`\`

## Troubleshooting

- **404 Not Found:** Verify the canonical path is correct
- **Parameter Errors:** Check parameter name mappings above
- **Response Format:** New API returns same schema as legacy for backward compatibility

## Support
For questions or issues, contact: support@wealthos.example.com
`;

    return guide;
  }
}
