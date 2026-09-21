import fs from 'fs';
import path from 'path';
import { ModuleDependencyAnalyzer } from './src/server/services/phase2fasttrack/ModuleDependencyAnalyzer.js';

async function main() {
  const analyzer = new ModuleDependencyAnalyzer();
  const result = analyzer.analyze();
  fs.writeFileSync('reports/v674-fasttrack/CP2.1_DEPENDENCY_MAP.json', JSON.stringify(result, null, 2));
  console.log('Dependency map generated.');
}
main().catch(console.error);
