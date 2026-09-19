const fs = require('fs');
['tests/fasttrack_d2/DataPromotionGate.test.ts', 'tests/fasttrack_d2/IndependentVerifier.test.ts', 'tests/fasttrack_d2/AdversarialVerificationB.test.ts', 'tests/fasttrack_d2/ProvenanceEvidence.test.ts', 'tests/fasttrack_d2/AgentBHash.test.ts'].forEach(file => {
  if (fs.existsSync(file)) {
    let f = fs.readFileSync(file, 'utf8');
    f = f.replace(/import\s+\{.*\}\s+from\s+['"]vitest['"];?(\r?\n)?/g, '');
    fs.writeFileSync(file, f);
  }
});
