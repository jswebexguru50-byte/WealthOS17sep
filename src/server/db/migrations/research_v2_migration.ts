export const RESEARCH_V2_MIGRATION_VERSION = 0; // assigned by integrator at merge
import fs from 'node:fs';
import path from 'node:path';
export const RESEARCH_V2_SCHEMA_SQL = fs.readFileSync(path.join(process.cwd(), 'src/server/db/migrations/research_v2_schema.sql'), 'utf8');
