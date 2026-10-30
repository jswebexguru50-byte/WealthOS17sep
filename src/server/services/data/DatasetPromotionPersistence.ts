import { getDB, dbRun, dbAll } from '../../database.js';

export interface DatasetPromotionManifest {
  dataset_id: string;
  raw_sha256: string;
  canonical_sha256: string;
  source: string;
  provider: string;
  endpoint_version: string;
  requested_start: string;
  requested_end: string;
  actual_start: string;
  actual_end: string;
  coverage_pct: number;
  missing_ranges_json: string;
  pit_status: string;
  calendar_status: string;
  corporate_action_basis: string;
  verification_predicates_json: string;
  promotion_decision: string;
  promotion_reason: string;
  persisted_at: string;
}

const HASH = /^[a-f0-9]{64}$/i;
const REQUIRED = ['NO_GAPS', 'CALENDAR_SYNC', 'HASH_MATCH'];

function validate(manifest: DatasetPromotionManifest): void {
  if (!manifest?.dataset_id) throw new Error('dataset_id is required');
  if (manifest.promotion_decision !== 'PROMOTED') return;
  if (!HASH.test(String(manifest.raw_sha256 || ''))) throw new Error('PROMOTED dataset must have valid raw_sha256');
  if (!HASH.test(String(manifest.canonical_sha256 || ''))) throw new Error('PROMOTED dataset must have valid canonical_sha256');
  let predicates: unknown;
  try { predicates = JSON.parse(manifest.verification_predicates_json); } catch { throw new Error('Invalid verification predicates'); }
  if (!Array.isArray(predicates)) throw new Error('Invalid verification predicates');
  for (const predicate of REQUIRED) {
    if (!predicates.includes(predicate)) throw new Error(`missing required verification predicate: ${predicate}`);
  }
}

export class DatasetPromotionPersistence {
  static async persist(manifest: DatasetPromotionManifest): Promise<void> {
    validate(manifest);
    const db = getDB();
    await dbRun(db, `
      INSERT OR REPLACE INTO DatasetPromotionManifests (
        dataset_id, raw_sha256, canonical_sha256, source, provider,
        endpoint_version, requested_start, requested_end, actual_start,
        actual_end, coverage_pct, missing_ranges_json, pit_status,
        calendar_status, corporate_action_basis, verification_predicates_json,
        promotion_decision, promotion_reason, persisted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      manifest.dataset_id, manifest.raw_sha256, manifest.canonical_sha256,
      manifest.source, manifest.provider, manifest.endpoint_version,
      manifest.requested_start, manifest.requested_end, manifest.actual_start,
      manifest.actual_end, manifest.coverage_pct, manifest.missing_ranges_json,
      manifest.pit_status, manifest.calendar_status, manifest.corporate_action_basis,
      manifest.verification_predicates_json, manifest.promotion_decision,
      manifest.promotion_reason, manifest.persisted_at
    ]);
  }

  static async reload(datasetId: string): Promise<DatasetPromotionManifest | null> {
    const rows = await dbAll(getDB(), 'SELECT * FROM DatasetPromotionManifests WHERE dataset_id = ?', [datasetId]);
    return (rows[0] as DatasetPromotionManifest | undefined) || null;
  }
}

