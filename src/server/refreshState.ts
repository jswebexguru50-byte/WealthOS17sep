import { dbGet, dbRun } from './database.js';

export interface RefreshMetadata {
  refreshedAt: string;
  refreshLabel: string;
  source: string;
}

export function formatRefreshLabel(isoString?: string | null): string {
  if (!isoString) return 'Not refreshed yet';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Not refreshed yet';
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'Not refreshed yet';
  }
}

export async function persistRefreshStamp(db: any, source: string = 'sync'): Promise<RefreshMetadata> {
  const refreshedAt = new Date().toISOString();
  await dbRun(db, `INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)`, ['last_data_refresh', refreshedAt]);
  return {
    refreshedAt,
    refreshLabel: formatRefreshLabel(refreshedAt),
    source
  };
}

export async function getStoredRefreshStamp(db: any): Promise<RefreshMetadata | null> {
  try {
    const row = await dbGet(db, `SELECT value FROM AppConfig WHERE key = ?`, ['last_data_refresh']);
    if (!row?.value) return null;
    return {
      refreshedAt: row.value,
      refreshLabel: formatRefreshLabel(row.value),
      source: 'stored'
    };
  } catch {
    return null;
  }
}
