export interface CanonicalResearchInput {
  runId: string;
  ledgerPath: string;
  ledgerSha256: string;

  pitSnapshotPath: string;
  pitSnapshotSha256: string;

  universeSnapshotPath: string;
  universeSnapshotSha256: string;

  corporateActionSnapshotPath: string;
  corporateActionSnapshotSha256: string;

  financialFactSnapshotPath: string;
  financialFactSnapshotSha256: string;

  configurationHash: string;
  frozenManifestHash: string;

  periodStart: string;
  periodEnd: string;

  sourceVersions: Record<string, string>;
}
