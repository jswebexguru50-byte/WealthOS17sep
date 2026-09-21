const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');

const REPORT_FILE = 'reports/readiness/runtime/remediation/FIXED_DOWNLOADER_CANARY_REPORT.json';

const TEST_DATES = [
  '2024-07-08', // The original failure
  '2024-07-09', // Adjacent
  '2024-07-10', // Adjacent
  '2024-06-25', // Known legacy (pre-SEBI unified)
  '2023-12-01'  // Historical known-good
];

function buildBhavCopyUrl(dateStr) {
  const [yyyy, mm, dd] = dateStr.split('-');
  if (dateStr >= '2024-07-08') {
    return `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${yyyy}${mm}${dd}_F_0000.CSV`;
  }
  const yy = yyyy.slice(-2);
  return `https://www.bseindia.com/download/BhavCopy/Equity/EQ${dd}${mm}${yy}_CSV.ZIP`;
}

function parseBhavCopyCsv(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map(h => h.trim());
  
  if (header.includes('FinInstrmId') && header.includes('ClsPric')) {
    // Unified Format
    return { type: 'UNIFIED', count: lines.length - 1, sample: lines[1] };
  } else if (header.map(h => h.toUpperCase()).includes('SC_CODE')) {
    // Legacy Format
    return { type: 'LEGACY', count: lines.length - 1, sample: lines[1] };
  }
  return { type: 'UNKNOWN_FORMAT', count: 0 };
}

async function fetchAndValidate(dateStr) {
  const url = buildBhavCopyUrl(dateStr);
  console.log(`\nTesting ${dateStr} -> ${url}`);
  
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bseindia.com/' } }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        
        let parseResult = null;
        let validationStatus = 'FAILED';
        let bodySample = '';

        try {
          if (res.statusCode === 200) {
            if (url.endsWith('.ZIP')) {
              // Validate content type isn't text/html before unzipping
              if (contentType.includes('text/html') || buffer.toString('utf8', 0, 15).includes('<!DOCTYPE html>')) {
                 validationStatus = 'HTML_ERROR_PAGE_RECEIVED';
              } else {
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                if (zipEntries.length > 0) {
                  const csvText = zipEntries[0].getData().toString('utf8');
                  parseResult = parseBhavCopyCsv(csvText);
                  if (parseResult) validationStatus = 'PASS';
                }
              }
            } else {
              // CSV
              if (contentType.includes('text/html') || buffer.toString('utf8', 0, 15).includes('<!DOCTYPE html>')) {
                validationStatus = 'HTML_ERROR_PAGE_RECEIVED';
              } else {
                const csvText = buffer.toString('utf8');
                parseResult = parseBhavCopyCsv(csvText);
                if (parseResult) validationStatus = 'PASS';
              }
            }
          } else {
            validationStatus = `HTTP_${res.statusCode}`;
          }
        } catch(e) {
          validationStatus = `PARSE_ERROR: ${e.message}`;
        }
        
        resolve({
          date: dateStr,
          url,
          http_status: res.statusCode,
          content_type: contentType,
          validation: validationStatus,
          payload_type: parseResult ? parseResult.type : 'NONE',
          extracted_rows: parseResult ? parseResult.count : 0
        });
      });
    });
    req.on('error', e => resolve({ date: dateStr, validation: `NETWORK_ERROR: ${e.message}` }));
  });
}

async function runCanary() {
  const results = [];
  for (const date of TEST_DATES) {
    const res = await fetchAndValidate(date);
    console.log(res);
    results.push(res);
  }
  
  fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nCanary report written to ${REPORT_FILE}`);
}

runCanary();
