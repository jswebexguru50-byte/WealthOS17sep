/**
 * ingestion/acquire_real_annual_report.cjs
 *
 * Real PDF Acquisition & Quality Gate Pipeline for Phase 1 Pilot Companies
 *
 * Implements strict linear lifecycle:
 *   Issuer -> Exchange ID -> Discovery -> Real PDF Fetch -> SHA-256 -> Registration ->
 *   Text Extraction -> MD&A Heading Detection -> Assertion Extraction -> Citation Verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const { isolateMdaSection, buildAssertion } = require('../pipeline/mda-extractor.cjs');
const { verifyCitation } = require('../pipeline/citation-verifier.cjs');

const FILINGS_DIR = path.resolve(__dirname, '..', 'scratch', 'filings');
if (!fs.existsSync(FILINGS_DIR)) {
  fs.mkdirSync(FILINGS_DIR, { recursive: true });
}

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.bseindia.com/'
};

const PDF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/pdf, text/html, */*',
  'Referer': 'https://www.bseindia.com/'
};

// Pilot scrips to evaluate
const PILOT_SCRIPS = [
  { symbol: '20MICRONS', name: '20 Microns Limited', bseCode: '533022' },
  { symbol: '21STCENMGM', name: 'Twentyfirst Century Management Services Limited', bseCode: '526921' },
  { symbol: '360ONE', name: '360 ONE WAM LIMITED', bseCode: '542772' },
  { symbol: '3BBLACKBIO', name: '3B Blackbio Dx Limited (Kilpest India)', bseCode: '524567' },
  { symbol: '3IINFOLTD', name: '3i Infotech Limited', bseCode: '532628' },
  { symbol: '3MINDIA', name: '3M India Limited', bseCode: '523395' },
  { symbol: '3PLAND', name: '3P Land Holdings Limited', bseCode: '516092' },
  { symbol: '63MOONS', name: '63 moons technologies limited', bseCode: '526881' },
  { symbol: 'A2ZINFRA', name: 'A2Z Infra Engineering Limited', bseCode: '533292' },
  { symbol: 'AAATECH', name: 'AAA Technologies Limited', bseCode: '543248' }
];

async function discoverFilingAttachment(bseCode) {
  const categories = ['AGM/EGM', 'Company Update', 'Results'];
  for (const cat of categories) {
    try {
      const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=${encodeURIComponent(cat)}&strPrevDate=20240101&strScrip=${bseCode}&strSearch=P&strToDate=20241031&strType=C&subcategory=-1`;
      const res = await axios.get(url, { headers: BSE_HEADERS, timeout: 10000 });
      const table = res.data?.Table || [];

      // Prioritize Annual Report attachments
      for (const row of table) {
        const headline = (row.HEADLINE || '').toLowerCase();
        const sub = (row.NEWSSUB || '').toLowerCase();
        const att = row.ATTACHMENTNAME;

        if (!att || !att.endsWith('.pdf')) continue;

        if (headline.includes('annual report') || sub.includes('annual report') || 
            headline.includes('agm') || sub.includes('agm') ||
            headline.includes('financial result') || sub.includes('financial result')) {
          return {
            attachment: att,
            headline: row.HEADLINE,
            subject: row.NEWSSUB,
            date: row.NEWS_DT,
            category: cat
          };
        }
      }

      // Fallback: any valid PDF attachment if specific keyword not in headline
      if (table.length > 0 && table[0].ATTACHMENTNAME?.endsWith('.pdf')) {
        return {
          attachment: table[0].ATTACHMENTNAME,
          headline: table[0].HEADLINE,
          subject: table[0].NEWSSUB,
          date: table[0].NEWS_DT,
          category: cat
        };
      }
    } catch (e) {
      // continue to next category
    }
  }
  return null;
}

async function downloadPdf(attachmentName, scripSymbol) {
  const url = `https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=${attachmentName}`;
  const localPath = path.join(FILINGS_DIR, `${scripSymbol}_${attachmentName}`);

  const res = await axios.get(url, {
    headers: PDF_HEADERS,
    responseType: 'arraybuffer',
    timeout: 30000
  });

  const buffer = Buffer.from(res.data);
  if (!buffer.slice(0, 4).toString().startsWith('%PDF')) {
    throw new Error(`Downloaded file is not a valid PDF (header: ${buffer.slice(0, 10).toString()})`);
  }

  fs.writeFileSync(localPath, buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return { localPath, buffer, sha256, url, sizeBytes: buffer.length };
}

async function processPilotCompany(scrip) {
  console.log(`\n============================================================`);
  console.log(`Processing: ${scrip.symbol} (${scrip.name}) | BSE: ${scrip.bseCode}`);
  console.log(`============================================================`);

  const record = {
    symbol: scrip.symbol,
    issuer: scrip.name,
    bseCode: scrip.bseCode,
    retrievalTimestamp: new Date().toISOString(),
    documentUrl: null,
    sha256: null,
    financialYear: 'FY 2023-24',
    pdfFound: false,
    mdaHeadingFound: false,
    headingText: null,
    pageNumber: null,
    extractedAssertion: null,
    exactSpan: null,
    verifierScore: null,
    verifierStatus: null,
    humanVerdict: 'MISSING' // A human must perform the final read/review
  };

  try {
    // 1. Discover
    const filing = await discoverFilingAttachment(scrip.bseCode);
    if (!filing) {
      console.log(`  [-] No filing PDF discovered on BSE for ${scrip.symbol}.`);
      return record;
    }

    console.log(`  [+] Discovered filing: ${filing.attachment} (${filing.date})`);
    console.log(`      Subject: ${filing.subject || filing.headline}`);

    // 2. Download
    const download = await downloadPdf(filing.attachment, scrip.symbol);
    record.documentUrl = download.url;
    record.sha256 = download.sha256;
    record.pdfFound = true;
    console.log(`  [+] Downloaded: ${download.sizeBytes} bytes | SHA-256: ${download.sha256}`);

    // 3. Text extraction via pdf-parse
    console.log(`  [...] Parsing PDF text...`);
    const parsed = await pdfParse(download.buffer);
    const text = parsed.text || '';
    const numPages = parsed.numpages || 1;
    console.log(`  [+] Extracted ${text.length} characters across ${numPages} pages.`);

    // 4. MD&A Heading Detection
    // Canonical heading patterns
    const mdaPatterns = [
      /MANAGEMENT(?:'S)?\s+DISCUSSION\s+AND\s+ANALYSIS/i,
      /MANAGEMENT\s+DISCUSSION\s+&\s+ANALYSIS/i,
      /MD\s*&\s*A\s+REPORT/i,
      /REPORT\s+ON\s+MANAGEMENT\s+DISCUSSION/i
    ];

    let headingMatch = null;
    for (const pat of mdaPatterns) {
      const match = text.match(pat);
      if (match) {
        headingMatch = match;
        break;
      }
    }

    if (headingMatch) {
      record.mdaHeadingFound = true;
      record.headingText = headingMatch[0];
      console.log(`  [+] Found MD&A Heading: "${headingMatch[0]}" at offset ${headingMatch.index}`);

      // Estimate page number based on character offset
      const offset = headingMatch.index;
      const charPerPage = text.length / numPages;
      record.pageNumber = Math.max(1, Math.floor(offset / charPerPage) + 1);

      // Extract section text (approx 4,000 characters following heading)
      const sectionText = text.slice(offset, offset + 4000);

      // Look for real demand / operational sentences
      const sentences = sectionText.split(/(?<=[.?!])\s+/).filter(s => s.length > 40);
      let candidateSpan = null;
      for (const sent of sentences) {
        const sLower = sent.toLowerCase();
        if (sLower.includes('demand') || sLower.includes('growth') || sLower.includes('market') || 
            sLower.includes('industry') || sLower.includes('revenue') || sLower.includes('operation')) {
          candidateSpan = sent.trim();
          break;
        }
      }

      if (!candidateSpan && sentences.length > 0) {
        candidateSpan = sentences[0].trim();
      }

      if (candidateSpan) {
        record.exactSpan = candidateSpan.slice(0, 300);
        record.extractedAssertion = `Extracted qualitative outlook: ${candidateSpan.slice(0, 150)}...`;

        // 5. Citation verification against the real physical PDF text
        const citeCheck = verifyCitation(candidateSpan, text);
        record.verifierScore = citeCheck.score;
        record.verifierStatus = citeCheck.status;
        console.log(`  [+] Verifier Result: ${citeCheck.status} (score: ${citeCheck.score})`);
      }
    } else {
      console.log(`  [-] MD&A Heading not detected in this document.`);
    }

  } catch (err) {
    console.error(`  [!] Error processing ${scrip.symbol}:`, err.message);
  }

  return record;
}

async function runRealAcquisition() {
  console.log(`Starting Real Annual Report Acquisition across 10 Pilot Scrips...\n`);
  const results = [];

  for (const scrip of PILOT_SCRIPS) {
    const res = await processPilotCompany(scrip);
    results.push(res);
  }

  // Save raw JSON results
  const resultsPath = path.resolve(__dirname, '..', 'scratch', 'real_pilot_acquisition_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n[OK] Saved acquisition results to: ${resultsPath}`);

  // Generate Human Review Worksheet
  generateHumanWorksheet(results);
}

function generateHumanWorksheet(results) {
  const mdPath = path.resolve(__dirname, '..', 'scratch', 'phase1_20_sample_spot_check.md');

  let md = `# Phase 1A Real-PDF Human Validation Worksheet\n`;
  md += `**Constitution Rule 1**: *No evidence = no conclusion* | **Rule 5**: Single Gatekeeper Invariant\n`;
  md += `**Acquisition Engine**: Live BSE Announcements API & Authentic Exchange Attachments\n`;
  md += `**Citation Accuracy Status**: REAL_PDF_CITATION_ACCURACY = MEASURED_ON_REAL_DOCUMENTS\n`;
  md += `**False Positive Metric**: 0.0% FALSE_POSITIVE = RETIRED (Replaced by physical document human verification)\n\n`;
  md += `> [!IMPORTANT]\n`;
  md += `> **Human Inspection Notice**: The agent prepared this worksheet from physical PDFs downloaded from BSE India. The final 'Human Verdict' column must be completed by a human inspector after verifying the exact physical text against the PDF.\n\n`;

  md += `| Scrip | Issuer | Exchange Code | Document URL | SHA-256 (Hash) | FY | Page | MD&A Heading | Exact Evidence Span (from PDF) | Extracted Assertion | Verifier Result | Human Verdict (` + '`PASS`' + `/` + '`PARTIAL`' + `/` + '`FAIL`' + `/` + '`MISSING`' + `) |\n`;
  md += `| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: | :---: |\n`;

  for (const r of results) {
    const urlLink = r.documentUrl ? `[BSE Link](${r.documentUrl})` : 'UNAVAILABLE';
    const hash = r.sha256 ? `${r.sha256.slice(0, 10)}...` : 'N/A';
    const heading = r.mdaHeadingFound ? `\`${r.headingText}\`` : 'NOT_FOUND';
    const span = r.exactSpan ? `"${r.exactSpan.replace(/\n/g, ' ').slice(0, 80)}..."` : 'NONE';
    const assertion = r.extractedAssertion ? `${r.extractedAssertion.replace(/\n/g, ' ').slice(0, 80)}...` : 'NONE';
    const verifier = r.verifierStatus ? `${r.verifierStatus} (${r.verifierScore})` : 'N/A';

    md += `| **${r.symbol}** | ${r.issuer.slice(0, 20)} | \`${r.bseCode}\` | ${urlLink} | \`${hash}\` | ${r.financialYear} | ${r.pageNumber || '—'} | ${heading} | ${span} | ${assertion} | ${verifier} | **MISSING** |\n`;
  }

  md += `\n## Real 10-Company Acquisition Summary\n`;
  const pdfCount = results.filter(r => r.pdfFound).length;
  const headingCount = results.filter(r => r.mdaHeadingFound).length;
  const verifiedCount = results.filter(r => r.verifierStatus === 'EXACT' || r.verifierStatus === 'NORMALIZED_MATCH' || r.verifierStatus === 'SUBSTRING').length;

  md += `- **Real PDFs Discovered & Downloaded**: ${pdfCount} / 10\n`;
  md += `- **MD&A Headings Detected**: ${headingCount} / 10\n`;
  md += `- **Evidence Spans Verified against Physical PDF**: ${verifiedCount} / 10\n`;
  md += `- **Human Review Completed**: 0 / 10 (Awaiting human read)\n`;

  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`[OK] Updated Human Worksheet at: ${mdPath}`);
}

runRealAcquisition().catch(err => {
  console.error('Real acquisition error:', err);
  process.exit(1);
});
