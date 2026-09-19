import * as fs from 'fs';
import * as path from 'path';

export interface R4DataRequirement {
  featureId: string;
  securityId: string;
  decisionDate: string;
  requiredStartDate: string;
  requiredEndDate: string;
  sourceDomain: string;
  pitRequired: boolean;
  minimumCoverage: number;
}

export interface R4FeatureResult<T> {
  status: 'READY' | 'DATA_INSUFFICIENT' | 'PIT_INVALID' | 'PROVENANCE_INVALID';
  value?: T;
  featureId: string;
  securityId: string;
  decisionDate: string;
  sourceIds: string[];
  snapshotId: string;
  provenanceHash: string;
  rejectionReason?: string;
}

export class R4DataReadinessGate {
  private static snapshotDir: string = path.resolve('reports/data-acquisition/snapshots');

  public static verifySnapshotAvailable(domain: string): { available: boolean; snapshotId?: string } {
    if (!fs.existsSync(this.snapshotDir)) return { available: false };
    const files = fs.readdirSync(this.snapshotDir).filter(f => f.startsWith(`SNAP_${domain}`) && f.endsWith('.json'));
    if (files.length === 0) return { available: false };
    files.sort().reverse();
    return { available: true, snapshotId: files[0].replace('.json', '') };
  }

  public static validatePITBoundary(decisionTimestamp: string, dataTimestamp: string): boolean {
    // Decision timestamp must be strictly greater than or equal to data publication timestamp
    return new Date(dataTimestamp).getTime() <= new Date(decisionTimestamp).getTime();
  }
}
