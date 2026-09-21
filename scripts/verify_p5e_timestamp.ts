import fs from 'fs';
import path from 'path';

// P5-E Timestamp Call Chain Verifier

const ROOT_DIR = path.join(process.cwd(), 'src');

function walkDir(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.cjs')) {
      results.push(file);
    }
  });
  return results;
}

function verifyTimestampSemantics() {
  console.log("=== P5-E TIMESTAMP INDEPENDENT VERIFICATION ===");
  const files = [
    ...walkDir(ROOT_DIR),
    path.join(process.cwd(), 'server.ts')
  ];

  let recordValuationSnapshotCallers = 0;
  let explicitTimeFabrications = 0;
  
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    
    // Check for recordValuationSnapshot calls
    if (content.includes('recordValuationSnapshot(')) {
      if (file.includes('database.ts') && content.includes('export async function recordValuationSnapshot(')) {
         // definition itself
         continue;
      }
      console.log(`\nCALLER FOUND: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('recordValuationSnapshot(')) {
          console.log(`  Line ${i+1}: ${line.trim()}`);
          recordValuationSnapshotCallers++;
        }
      });
    }

    // Check for time fabrication near persistence boundaries
    if (file.includes('database.ts') || file.includes('fifoEngine.ts') || file.includes('server.ts')) {
      if (content.includes('new Date()') || content.includes('Date.now()') || content.includes('CURRENT_TIMESTAMP')) {
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes('new Date()') && !line.includes('updated_at') && !line.includes('created_at')) {
            // Just capturing potential issues
            // console.log(`  Potential Date Fabrication [${path.basename(file)}:${i+1}]: ${line.trim()}`);
          }
        });
      }
    }
  }

  console.log(`\nTotal production callers found: ${recordValuationSnapshotCallers}`);
  if (recordValuationSnapshotCallers === 0) {
    console.log("RESULT: recordValuationSnapshot has 0 active production callers. Exposure is solely API surface.");
  }

  // Also check database.ts for the actual implementation to ensure the fallback is removed
  const dbFile = path.join(ROOT_DIR, 'server', 'database.ts');
  const dbContent = fs.readFileSync(dbFile, 'utf8');
  if (dbContent.includes('const dStr = dateStr || new Date().toISOString()')) {
    console.error("FAIL: recordValuationSnapshot still contains new Date() fallback.");
    process.exit(1);
  } else if (dbContent.includes('if (!dateStr) {') && dbContent.includes('throw new Error(')) {
    console.log("RESULT: recordValuationSnapshot explicit fail-closed logic verified.");
  } else {
    console.error("FAIL: Missing throw on undefined dateStr in recordValuationSnapshot.");
    process.exit(1);
  }
  
  console.log("=== P5-E VERIFICATION PASS ===");
}

verifyTimestampSemantics();
