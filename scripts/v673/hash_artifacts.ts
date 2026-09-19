import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function updateArtifactManifest() {
  const dir = 'reports/v672-r3/final';
  const files = fs.readdirSync(dir);
  const manifest: Record<string, string> = {};

  for (const f of files) {
    if (f.endsWith('.json') || f.endsWith('.md')) {
      const p = path.join(dir, f);
      const content = fs.readFileSync(p);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      manifest[f] = hash;
    }
  }

  fs.writeFileSync('reports/v672-r3/final/R3_ARTIFACT_MANIFEST.json', JSON.stringify(manifest, null, 2));
  console.log('R3_ARTIFACT_MANIFEST.json updated with', Object.keys(manifest).length, 'artifacts.');
}

updateArtifactManifest();
