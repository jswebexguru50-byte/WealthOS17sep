export function auditIsValid(auditDatasetHash: string, currentDatasetHash: string, auditDomains: string[], changedDomains: string[]): boolean {
  if (auditDatasetHash !== currentDatasetHash) return false;
  const changed = new Set(changedDomains);
  return !auditDomains.some(domain => changed.has(domain));
}
export class S1101R2DatasetVersionManager {
  constructor(private readonly baseDir = 'reports/v674-s1101r2') {}
  isAuditCurrent(auditDatasetHash: string, currentDatasetHash: string): boolean { return auditDatasetHash === currentDatasetHash; }
}
