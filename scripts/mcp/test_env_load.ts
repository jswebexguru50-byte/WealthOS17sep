import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
console.log('__dir in test script:', __dir);
const envPathCwd = resolve(process.cwd(), '.env');
const envPathMeta = resolve(__dir, '../../.env');
const envPath3 = resolve(__dir, '../../../.env');

console.log('envPathCwd:', envPathCwd, 'exists:', existsSync(envPathCwd));
console.log('envPathMeta (2 levels):', envPathMeta, 'exists:', existsSync(envPathMeta));
console.log('envPath3 (3 levels):', envPath3, 'exists:', existsSync(envPath3));

if (existsSync(envPathCwd)) {
  const content = readFileSync(envPathCwd, 'utf-8');
  console.log('.env file size:', content.length);
  content.split('\n').forEach(line => {
    const m = line.match(/^\s*([^#=][^=]*)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (key.includes('WEALTHOS')) {
        console.log('Found key:', key, 'length:', val.length, 'starts with:', val.slice(0, 8));
      }
    }
  });
}
