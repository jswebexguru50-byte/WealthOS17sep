import fs from 'fs';
import path from 'path';
import readline from 'readline';

async function countLines(filePath: string): Promise<number> {
    return new Promise((resolve) => {
        let count = 0;
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        rl.on('line', () => count++);
        rl.on('close', () => resolve(count));
        rl.on('error', () => resolve(-1));
    });
}

async function findCanonicalLedger(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            await findCanonicalLedger(fullPath);
        } else if (entry.name.endsWith('.jsonl') || entry.name.endsWith('.csv') || entry.name.endsWith('.json')) {
            const lines = await countLines(fullPath);
            if (lines === 6501 || lines === 6502) {
                console.log(`POTENTIAL LEDGER FOUND: ${fullPath} (Lines: ${lines})`);
            }
        }
    }
}

console.log("Searching for canonical ledger with 6,501 signals...");
findCanonicalLedger(process.cwd()).then(() => console.log("Done."));
