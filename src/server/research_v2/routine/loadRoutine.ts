import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface RoutineDefinition {
  routineVersion: string;
  scope: 'FUNDAMENTAL_ONLY';
  questionIds: string[];
  promptHashes: Record<string, string>;
}

export interface LoadedRoutine {
  definition: RoutineDefinition;
  sha256: string;
  sourcePath: string;
}

function validate(value: unknown): RoutineDefinition {
  if (!value || typeof value !== 'object') throw new Error('Routine must be an object');
  const v = value as Record<string, unknown>;
  if (typeof v.routineVersion !== 'string' || !v.routineVersion.trim()) throw new Error('Routine routineVersion is required');
  if (v.scope !== 'FUNDAMENTAL_ONLY') throw new Error('Routine scope must be FUNDAMENTAL_ONLY');
  if (!Array.isArray(v.questionIds) || v.questionIds.length !== 29 || v.questionIds.some(x => typeof x !== 'string')) {
    throw new Error('Routine must contain exactly 29 question ids');
  }
  if (!v.promptHashes || typeof v.promptHashes !== 'object' || Array.isArray(v.promptHashes)) throw new Error('Routine promptHashes is required');
  return { routineVersion: v.routineVersion, scope: 'FUNDAMENTAL_ONLY', questionIds: [...v.questionIds] as string[], promptHashes: { ...(v.promptHashes as Record<string, string>) } };
}

export function loadRoutine(filePath = path.resolve(process.cwd(), 'src/server/research_v2/routine/ROUTINE_V2.json')): LoadedRoutine {
  const sourcePath = path.resolve(filePath);
  const raw = fs.readFileSync(sourcePath);
  const definition = validate(JSON.parse(raw.toString('utf8')));
  return { definition, sha256: crypto.createHash('sha256').update(raw).digest('hex'), sourcePath };
}
