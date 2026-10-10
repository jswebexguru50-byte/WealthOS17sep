import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonSchema } from './jsonSchema.js';

/** Directory of this module; falls back to the repo layout when import.meta is unavailable (bundled CJS). */
export function agentsDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(process.cwd(), 'src', 'server', 'research_v2', 'agents');
  }
}

/** Absolute path of a packaged schema or prompt file. */
export function packFile(...parts: string[]): string {
  return path.join(agentsDir(), ...parts);
}

/** Loads the drafter output schema. */
export function loadAnswersSchema(): JsonSchema {
  return JSON.parse(readFileSync(packFile('schemas', 'answers.schema.json'), 'utf8')) as JsonSchema;
}

/** Loads the reviewer output schema. */
export function loadReviewSchema(): JsonSchema {
  return JSON.parse(readFileSync(packFile('schemas', 'review.schema.json'), 'utf8')) as JsonSchema;
}

/** Loads a prompt file (`drafter.md` or `reviewer.md`). */
export function loadPrompt(name: 'drafter' | 'reviewer'): string {
  return readFileSync(packFile('prompts', `${name}.md`), 'utf8');
}
