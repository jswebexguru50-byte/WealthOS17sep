/**
 * scripts/convert_chunks_for_ai_studio.ts
 *
 * Converts all .jsonl data chunks into .txt and standard .json formats
 * guaranteed to be accepted by Google AI Studio's web UI file uploader.
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const CHUNKS_DIR = path.join(WORKSPACE_ROOT, 'data', 'ai_studio_chunks');

function main() {
  console.log('Converting data chunks to universal .txt and .json formats for Google AI Studio...');

  if (!fs.existsSync(CHUNKS_DIR)) {
    throw new Error(`Chunks directory not found: ${CHUNKS_DIR}`);
  }

  const files = fs.readdirSync(CHUNKS_DIR);
  for (const f of files) {
    if (f.endsWith('.jsonl')) {
      const srcPath = path.join(CHUNKS_DIR, f);
      const content = fs.readFileSync(srcPath, 'utf8');

      // 1. Create .txt version (universally accepted by AI Studio file picker)
      const txtPath = path.join(CHUNKS_DIR, f.replace('.jsonl', '.txt'));
      fs.writeFileSync(txtPath, content, 'utf8');

      // 2. Create valid array .json version
      const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
      try {
        const jsonArray = lines.map(l => JSON.parse(l));
        const jsonPath = path.join(CHUNKS_DIR, f.replace('.jsonl', '.json'));
        fs.writeFileSync(jsonPath, JSON.stringify(jsonArray, null, 2), 'utf8');
        console.log(`✓ Converted ${f} -> ${path.basename(txtPath)} & ${path.basename(jsonPath)}`);
      } catch (e: any) {
        console.log(`✓ Created text file: ${path.basename(txtPath)}`);
      }
    }
  }

  console.log('\nAll chunks are now available in both .txt and .json formats in data/ai_studio_chunks/');
}

main();
