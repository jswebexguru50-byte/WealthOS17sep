import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = '.env';
const lines = fs.readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n');
let reviewKey = '';
for (const l of lines) {
  if (l.startsWith('WEALTHOS_REVIEW_KEY=')) reviewKey = l.split('=')[1].trim().replace(/^["']|["']$/g, '');
}

const payload = {
  jsonrpc: '2.0',
  id: 302,
  method: 'tools/call',
  params: {
    name: 'record_fundamental_review',
    arguments: {
      runId: 'PILOT_RUN_001',
      reviews: [{
        claimId: 'CLAIM_TCS_GROWTH_01',
        symbol: 'TCS',
        module: 'FUNDAMENTAL',
        dimension: 'REVENUE_GROWTH',
        reviewStatus: 'SUPPORTED',
        confidence: 'HIGH',
        supportingEvidenceIds: ['FACT_REV_TCS_2025'],
        contradictingEvidenceIds: [],
        missingContext: [],
        issueType: null,
        reviewExplanation: 'Independent reviewer confirmed revenue YoY growth matches audited SEC/BSE filings.',
        generalPrinciple: 'Audited annual reported revenue YoY takes precedence over interim estimates.'
      }]
    }
  }
};

const data = JSON.stringify(payload);
const req = http.request({
  hostname: '127.0.0.1', port: 8787, path: '/mcp/review', method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': `Bearer ${reviewKey}`
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => console.log('T-REV-02 response:', res.statusCode, b));
});
req.write(data);
req.end();
