import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration } from '../migrator.js';
const name = '014_document_storage_lifecycle';
export const migration014: Migration = { id:14, name, checksum:crypto.createHash('sha256').update(name).digest('hex'), up:(db:Database.Database)=>{ const cols=new Set((db.prepare('PRAGMA table_info(family_documents)').all() as any[]).map(c=>c.name)); const add=(sql:string,col:string)=>{if(!cols.has(col))db.exec(sql)}; add('ALTER TABLE family_documents ADD COLUMN mime_type TEXT','mime_type'); add('ALTER TABLE family_documents ADD COLUMN size_bytes INTEGER','size_bytes'); add('ALTER TABLE family_documents ADD COLUMN checksum_verified INTEGER NOT NULL DEFAULT 0','checksum_verified'); add('ALTER TABLE family_documents ADD COLUMN last_verified_at TEXT','last_verified_at'); add('ALTER TABLE family_documents ADD COLUMN reminder_days INTEGER NOT NULL DEFAULT 30','reminder_days'); db.exec('CREATE INDEX IF NOT EXISTS idx_family_documents_status_expiry ON family_documents(status, expires_on, reminder_days)'); }};

