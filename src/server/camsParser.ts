import * as XLSX from 'xlsx';
import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Safely obtain require function for both ESM (development) and CJS (production bundle)
let safeRequire: any;
if (typeof require !== 'undefined') {
  safeRequire = require;
} else {
  // @ts-ignore
  safeRequire = createRequire(process.cwd() + '/index.js');
}

const pdf = safeRequire('pdf-parse');

export interface CamsTransaction {
  date: string; // YYYY-MM-DD
  schemeName: string;
  isin: string;
  type: string;
  quantity: number;
  price: number;
  amount: number;
  folio?: string;
}

let cachedAmfiMap: Map<string, number> | null = null;
let cachedAmfiMapTime = 0;
const AMFI_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

let cachedSchemeCodes: {
  isinToCode: Map<string, string>;
  nameToCode: Map<string, string>;
  codeToNav: Map<string, number>;
} | null = null;
let cachedSchemeCodesTime = 0;

/**
 * Fetches the latest mutual fund NAVs from AMFI (Association of Mutual Funds in India)
 * and returns a map of ISIN -> NAV price (number).
 */
export async function fetchAMFINavs(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedAmfiMap && (now - cachedAmfiMapTime < AMFI_CACHE_TTL)) {
    console.log('[AMFI Sync] Returning cached NAV prices.');
    return cachedAmfiMap;
  }
  const isinMap = new Map<string, number>();
  try {
    const response = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      throw new Error(`AMFI returned status ${response.status}`);
    }
    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Scheme Code') || trimmed.includes('Open Ended Schemes')) {
        continue;
      }
      const parts = trimmed.split(';');
      if (parts.length >= 5) {
        // Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
        const isinGrowth = parts[1]?.trim();
        const isinReinvest = parts[2]?.trim();
        const schemeName = parts[3]?.trim();
        const navStr = parts[4]?.trim();
        const nav = parseFloat(navStr || '');

        if (!isNaN(nav) && nav > 0) {
          if (isinGrowth && isinGrowth !== '-') {
            isinMap.set(isinGrowth.toUpperCase(), nav);
          }
          if (isinReinvest && isinReinvest !== '-') {
            isinMap.set(isinReinvest.toUpperCase(), nav);
          }
          if (schemeName) {
            const upperScheme = schemeName.toUpperCase();
            isinMap.set(upperScheme, nav);
            // Also normalize spaces (replace multiple spaces with one)
            const normalized = upperScheme.replace(/\s+/g, ' ').trim();
            isinMap.set(normalized, nav);
          }
        }
      }
    }
    console.log(`[AMFI Sync] Successfully fetched and parsed ${isinMap.size} NAV prices from AMFI.`);
    cachedAmfiMap = isinMap;
    cachedAmfiMapTime = now;
  } catch (err) {
    console.error('[AMFI Sync] Failed to fetch NAVs from AMFI:', err);
  }
  return isinMap;
}

/**
 * Checks if a buffer is a PDF by reading its magic bytes.
 */
export function isPdf(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46; // %PDF
}

/**
 * Checks if a PDF is encrypted / password-protected without calling any external library.
 */
export function isPdfEncrypted(buffer: Buffer): boolean {
  try {
    const content = buffer.toString('binary');
    return content.includes('/Encrypt');
  } catch {
    return false;
  }
}

/**
 * Extracts text content from a PDF (including password-encrypted PDFs) using the legacy build of pdfjs-dist.
 */
export async function extractTextFromPdf(buffer: Buffer, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  // Configure workerSrc to absolute legacy worker path
  const workerPath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = workerPath;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    password: password,
    standardFontDataUrl: path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/') + '/'
  });

  const pdfDoc = await loadingTask.promise;
  let fullText = '';
  
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Group text items by Y-coordinate (transform[5])
    const rows: { y: number; items: any[] }[] = [];
    const tolerance = 4.0; // Tolerance in points to group items on the same line
    
    for (const item of items) {
      if (!item || typeof item.str !== 'string' || !Array.isArray(item.transform) || item.transform.length < 6) continue;
      const y = item.transform[5];
      let foundRow = rows.find(r => Math.abs(r.y - y) <= tolerance);
      if (!foundRow) {
        foundRow = { y, items: [] };
        rows.push(foundRow);
      }
      foundRow.items.push(item);
    }
    
    // Sort rows from top to bottom (y decreases as we go down the page)
    rows.sort((a, b) => b.y - a.y);
    
    // Sort items in each row horizontally from left to right (x increases, transform[4])
    const pageLines: string[] = [];
    for (const row of rows) {
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);
      const lineText = row.items.map(item => item.str).join(' ');
      pageLines.push(lineText);
    }
    
    fullText += pageLines.join('\n') + '\n';
  }
  
  return fullText;
}

/**
 * Smart combination solver for CAMS transaction row numeric values.
 * Identifies which number represents Amount, Price (NAV), and Quantity (Units)
 * by finding a pair of numbers whose product is within 2% of a third number.
 */
export function identifyCamsNumbers(nums: number[]): { amount: number; quantity: number; price: number } | null {
  if (nums.length < 2) return null;
  
  if (nums.length === 2) {
    const val1 = nums[0];
    const val2 = nums[1];
    const maxVal = Math.max(val1, val2);
    const minVal = Math.min(val1, val2);
    
    const maxStr = maxVal.toString();
    const minStr = minVal.toString();
    const minDec = minStr.includes('.') ? minStr.split('.')[1].length : 0;
    const maxDec = maxStr.includes('.') ? maxStr.split('.')[1].length : 0;
    
    if (maxVal >= 500.0) {
      // maxVal is likely the transaction Amount
      if (minDec === 3) {
        // minVal is likely Quantity (units are usually 3 decimals)
        return {
          amount: maxVal,
          quantity: minVal,
          price: maxVal / minVal
        };
      } else {
        // minVal is likely Price (NAV)
        return {
          amount: maxVal,
          quantity: maxVal / minVal,
          price: minVal
        };
      }
    } else {
      // Both are relatively small, likely Quantity and Price (NAV)
      if (minDec === 3 && maxDec !== 3) {
        return {
          amount: minVal * maxVal,
          quantity: minVal,
          price: maxVal
        };
      } else if (maxDec === 3 && minDec !== 3) {
        return {
          amount: minVal * maxVal,
          quantity: maxVal,
          price: minVal
        };
      }
      
      // Default fallback if decimals are not matching
      return {
        amount: val1 * val2,
        quantity: val1,
        price: val2
      };
    }
  }

  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < nums.length; k++) {
        if (k === i || k === j) continue;
        const a = nums[i];
        const b = nums[j];
        const c = nums[k];
        
        const product = a * b;
        const diffRatio = Math.abs(product - c) / Math.max(c, 1);
        if (diffRatio < 0.05) {
          let quantity = a;
          let price = b;
          const aStr = a.toString();
          const bStr = b.toString();
          const aDec = aStr.includes('.') ? aStr.split('.')[1].length : 0;
          const bDec = bStr.includes('.') ? bStr.split('.')[1].length : 0;
          if (bDec === 3 && aDec !== 3) {
            quantity = b;
            price = a;
          } else if (aDec === 3 && bDec !== 3) {
            quantity = a;
            price = b;
          }
          
          return { amount: c, quantity, price };
        }
      }
    }
  }

  const sorted = [...nums].sort((x, y) => y - x);
  const amount = sorted[0];
  const quantity = sorted[1];
  const price = sorted[2] || (quantity > 0 ? amount / quantity : 0);
  
  return { amount, quantity, price };
}

/**
 * Generates a unique fallback ISIN based on scheme name.
 */
export function generateFallbackIsin(schemeName: string): string {
  let hash = 0;
  const upperScheme = schemeName.toUpperCase();
  for (let i = 0; i < upperScheme.length; i++) {
    hash = (hash << 5) - hash + upperScheme.charCodeAt(i);
    hash |= 0;
  }
  return 'INF' + Math.abs(hash).toString(36).toUpperCase().padEnd(9, 'X').slice(0, 9);
}

/**
 * Extracts a PAN number from a string (such as filename or text content).
 * Standard Indian PAN: 5 letters, 4 digits, 1 letter.
 */
export function extractPanFromString(str: string): string | undefined {
  const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]/i;
  const match = str.match(panRegex);
  return match ? match[0].toUpperCase() : undefined;
}

/**
 * Cleans the folio number out of a scheme name and returns the cleaned name and the folio number.
 */
export function cleanSchemeName(name: string): { cleanedName: string; extractedFolio?: string } {
  let cleaned = name.trim();
  let extractedFolio: string | undefined;

  const folioRegexes = [
    /\((?:folio|folio\s*no\.?|folio\s*number)?\s*[:\-]?\s*([0-9]{4,12}(?:\s*\/\s*[0-9]{1,4})?)\)/i,
    /\b(?:folio|folio\s*no\.?|folio\s*number)\s*[:\-]?\s*([0-9]{4,12}(?:\s*\/\s*[0-9]{1,4})?)\b/i,
    /\b([0-9]{6,12}\s*\/\s*[0-9]{1,4})\b/ // e.g. 10928374 / 99
  ];

  for (const regex of folioRegexes) {
    const match = cleaned.match(regex);
    if (match) {
      extractedFolio = match[1].replace(/\s+/g, ''); // Normalize by stripping any spaces (e.g. "1234 / 99" -> "1234/99")
      cleaned = cleaned.replace(match[0], '').trim();
      break;
    }
  }

  // Also remove common separators or brackets left behind
  cleaned = cleaned
    .replace(/^[-:/\|\s]+|[-:/\|\s]+$/g, '') // remove leading/trailing separators
    .replace(/\s*\(\s*\)\s*/g, ' ')           // remove empty parentheses
    .replace(/\s+[-:/\|]\s+$/g, '')          // remove trailing dangling separator
    .trim();

  // If there are still multiple spaces, normalize them
  cleaned = cleaned.replace(/\s+/g, ' ');

  return { cleanedName: cleaned, extractedFolio };
}

/**
 * Main parser entry point. Detects PDF/Excel/CSV, processes accordingly, and extracts transactions and PAN.
 */
// Module-level caches for auto-fetching ISIN from net
let nseSymbolMap = new Map<string, string>();
let nseNameMap = new Map<string, string>();
let nseListFetched = false;

async function fetchNSEListedStocks(): Promise<void> {
  if (nseListFetched) return;
  try {
    console.log('[ISIN Fetch] Downloading NSE stock list from EQUITY_L.csv...');
    const res = await fetch('https://archives.nseindia.com/content/equities/EQUITY_L.csv', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`NSE returned status ${res.status}`);
    }
    const csvText = await res.text();
    const lines = csvText.split('\n');
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 7) {
        const symbol = parts[0]?.trim().toUpperCase();
        const name = parts[1]?.trim().toUpperCase();
        const isin = parts[6]?.trim().toUpperCase();
        if (symbol && isin && isin !== 'ISIN NUMBER' && isin.startsWith('INE')) {
          nseSymbolMap.set(symbol, isin);
          if (name) {
            nseNameMap.set(name, isin);
            const cleanName = name.replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            nseNameMap.set(cleanName, isin);
          }
        }
      }
    }
    nseListFetched = true;
    console.log(`[ISIN Fetch] Successfully loaded ${nseSymbolMap.size} NSE stock ISINs.`);
  } catch (err) {
    console.error('[ISIN Fetch] Failed to download NSE listed stocks:', err);
  }
}

let amfiNameMap = new Map<string, string>();
let amfiListFetched = false;

async function fetchAMFIMapping(): Promise<void> {
  if (amfiListFetched) return;
  try {
    console.log('[ISIN Fetch] Downloading AMFI scheme list from NAVAll.txt...');
    const response = await fetch('https://www.amfiindia.com/spages/NAVAll.txt');
    if (!response.ok) {
      throw new Error(`AMFI returned status ${response.status}`);
    }
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Scheme Code') || trimmed.includes('Open Ended Schemes')) {
        continue;
      }
      const parts = trimmed.split(';');
      if (parts.length >= 5) {
        const isinGrowth = parts[1]?.trim().toUpperCase();
        const isinReinvest = parts[2]?.trim().toUpperCase();
        const schemeName = parts[3]?.trim().toUpperCase();
        
        const isin = (isinGrowth && isinGrowth !== '-') ? isinGrowth : ((isinReinvest && isinReinvest !== '-') ? isinReinvest : '');
        if (isin && schemeName) {
          amfiNameMap.set(schemeName, isin);
          const cleanName = schemeName.replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
          amfiNameMap.set(cleanName, isin);
        }
      }
    }
    amfiListFetched = true;
    console.log(`[ISIN Fetch] Successfully loaded ${amfiNameMap.size} AMFI mutual fund ISINs.`);
  } catch (err) {
    console.error('[ISIN Fetch] Failed to download AMFI mutual funds:', err);
  }
}

export async function fetchRealIsinFromNet(query: string): Promise<string | null> {
  const cleanQuery = query.toUpperCase().trim();
  if (!cleanQuery) return null;

  try {
    // Make sure lists are fetched
    await Promise.all([fetchNSEListedStocks(), fetchAMFIMapping()]);
  } catch (err) {
    console.warn('[ISIN Resolver] Error fetching master lists, continuing with search fallbacks...', err);
  }

  // 1. Direct match on cached lists
  const cleanNameQuery = cleanQuery.replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Try NSE direct match (by Symbol or exact clean name)
  let foundIsin = nseSymbolMap.get(cleanQuery) || nseNameMap.get(cleanQuery) || nseNameMap.get(cleanNameQuery);
  if (foundIsin) {
    console.log(`[ISIN Resolver] Resolved "${query}" -> ${foundIsin} via NSE exact match.`);
    return foundIsin;
  }

  // Try AMFI direct match (by exact clean name)
  foundIsin = amfiNameMap.get(cleanQuery) || amfiNameMap.get(cleanNameQuery);
  if (foundIsin) {
    console.log(`[ISIN Resolver] Resolved "${query}" -> ${foundIsin} via AMFI exact match.`);
    return foundIsin;
  }

  // 2. Fuzzy token-based matching on AMFI list (for mutual funds)
  let bestMFMatchIsin: string | null = null;
  let bestMFScore = 0;
  const queryTokens = cleanNameQuery.split(' ').filter(t => t.length > 2 && !['FUND', 'PLAN', 'GROWTH', 'EQUITY', 'INDEX', 'DIRECT', 'REGULAR', 'OPTION'].includes(t));

  if (queryTokens.length > 0) {
    for (const [amfiName, isin] of amfiNameMap.entries()) {
      const amfiClean = amfiName.replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const amfiTokens = amfiClean.split(' ');
      
      let matchedCount = 0;
      for (const t of queryTokens) {
        if (amfiTokens.includes(t)) {
          matchedCount++;
        }
      }
      
      const score = matchedCount / Math.max(queryTokens.length, 1);
      if (score > bestMFScore && score >= 0.5) {
        bestMFScore = score;
        bestMFMatchIsin = isin;
        if (score === 1.0) break;
      }
    }
  }

  if (bestMFMatchIsin && bestMFScore >= 0.6) {
    console.log(`[ISIN Resolver] Resolved "${query}" -> ${bestMFMatchIsin} via AMFI token fuzzy match (Score: ${bestMFScore.toFixed(2)}).`);
    return bestMFMatchIsin;
  }

  // 3. Fuzzy token-based matching on NSE list (for stocks)
  let bestStockMatchIsin: string | null = null;
  let bestStockScore = 0;
  const stockTokens = cleanNameQuery.split(' ').filter(t => t.length > 2 && !['LIMITED', 'LTD', 'CORP', 'CORPORATION', 'CO'].includes(t));

  if (stockTokens.length > 0) {
    for (const [stockName, isin] of nseNameMap.entries()) {
      const stockClean = stockName.replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const stockTokensList = stockClean.split(' ');
      
      let matchedCount = 0;
      for (const t of stockTokens) {
        if (stockTokensList.includes(t)) {
          matchedCount++;
        }
      }
      
      const score = matchedCount / Math.max(stockTokens.length, 1);
      if (score > bestStockScore && score >= 0.5) {
        bestStockScore = score;
        bestStockMatchIsin = isin;
        if (score === 1.0) break;
      }
    }
  }

  if (bestStockMatchIsin && bestStockScore >= 0.6) {
    console.log(`[ISIN Resolver] Resolved "${query}" -> ${bestStockMatchIsin} via NSE token fuzzy match (Score: ${bestStockScore.toFixed(2)}).`);
    return bestStockMatchIsin;
  }

  // 4. Fallback to Yahoo Finance Search API
  try {
    console.log(`[ISIN Resolver] Querying Yahoo Finance search API for "${query}"...`);
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const json = await res.json() as any;
      if (json.quotes && json.quotes.length > 0) {
        // First look for a quote with an explicit ISIN
        for (const q of json.quotes) {
          if (q.isin && q.isin.length === 12) {
            console.log(`[ISIN Resolver] Resolved "${query}" -> ${q.isin} via Yahoo Search Quote ISIN.`);
            return q.isin.toUpperCase();
          }
        }
        
        // Match base symbol from Indian exchange quotes
        const nsQuote = json.quotes.find((q: any) => q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')));
        if (nsQuote) {
          const baseSymbol = nsQuote.symbol.split('.')[0].toUpperCase();
          const mappedIsin = nseSymbolMap.get(baseSymbol);
          if (mappedIsin) {
            console.log(`[ISIN Resolver] Resolved "${query}" -> ${mappedIsin} via Yahoo Ticker ${nsQuote.symbol} mapping.`);
            return mappedIsin;
          }
        }
      }
    }
  } catch (err) {
    console.error(`[ISIN Resolver] Yahoo Search failed for "${query}":`, err);
  }

  return null;
}

export async function parseCamsStatement(
  buffer: Buffer,
  originalname?: string,
  password?: string,
  fallbackPan?: string
): Promise<{ transactions: CamsTransaction[]; detectedPan?: string }> {
  let detectedPan = originalname ? extractPanFromString(originalname) : undefined;
  if (!detectedPan && fallbackPan) {
    detectedPan = extractPanFromString(fallbackPan);
  }
  const transactions: CamsTransaction[] = [];

  // 1. Parses CAMS CAS PDF statements using python's parse_pdf.py script and casparser
  if (isPdf(buffer)) {
    console.log(`[CAMS Parser] User uploaded a CAMS CAS PDF statement.`);
    
    // Check if PDF is encrypted and password is empty
    if (isPdfEncrypted(buffer) && !password) {
      console.log(`[CAMS Parser] CAMS PDF is encrypted and no password was provided.`);
      throw new Error('PASSWORD_REQUIRED');
    }

    const tempFilePath = path.join(process.cwd(), `temp_cams_${Date.now()}.pdf`);
    await fs.writeFile(tempFilePath, buffer);

    try {
      console.log(`[CAMS Parser] Invoking Python PDF parser script on ${tempFilePath}`);
      const pythonCmd = 'python3';
      const scriptPath = path.join(process.cwd(), 'src', 'server', 'parse_pdf.py');
      
      const { stdout, stderr } = await execFileAsync(pythonCmd, [scriptPath, tempFilePath, password || '']);
      
      // Clean up temp file
      await fs.unlink(tempFilePath).catch(() => {});

      if (stderr) {
        console.warn(`[CAMS Parser] Python script stderr:`, stderr);
      }

      let parsedResult;
      try {
        parsedResult = JSON.parse(stdout);
      } catch (parseErr) {
        console.error(`[CAMS Parser] Failed to parse python stdout JSON:`, stdout);
        throw new Error('Failed to parse PDF statement response.');
      }

      if (!parsedResult.success) {
        const errMsg = parsedResult.error || 'Unknown PDF parsing error';
        console.error(`[CAMS Parser] Python parser reported error:`, errMsg);
        const lowerErr = errMsg.toLowerCase();
        if (lowerErr.includes('password') || lowerErr.includes('decrypt') || lowerErr.includes('crypt') || lowerErr.includes('key')) {
          throw new Error('PASSWORD_REQUIRED');
        }
        throw new Error(`PDF statement parsing failed: ${errMsg}`);
      }

      console.log(`[CAMS Parser] Successfully parsed PDF transactions. Count: ${parsedResult.transactions?.length}`);
      
      return {
        transactions: parsedResult.transactions || [],
        detectedPan: parsedResult.detectedPan || detectedPan
      };

    } catch (err: any) {
      // Clean up temp file in case of error
      await fs.unlink(tempFilePath).catch(() => {});

      const errStr = String(err.message || err).toLowerCase();
      if (errStr.includes('password') || errStr.includes('decrypt') || errStr.includes('crypt') || errStr.includes('key')) {
        throw new Error('PASSWORD_REQUIRED');
      }
      throw err;
    }
  }

  // 2. Handle JSON Statements
  const isJson = originalname?.toLowerCase().endsWith('.json') || (buffer.length > 0 && (buffer[0] === 123 || buffer[0] === 91));
  if (isJson) {
    console.log('[CAMS Parser] Reading JSON statement buffer.');
    try {
      const jsonString = buffer.toString('utf8');
      const data = JSON.parse(jsonString);
      let rawList: any[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === 'object') {
        const possibleKey = Object.keys(data).find(k => Array.isArray((data as any)[k]));
        if (possibleKey) {
          rawList = (data as any)[possibleKey];
        } else {
          rawList = [data];
        }
      }

      for (const item of rawList) {
        if (!item || typeof item !== 'object') continue;

        // Smart key mapping
        const dateVal = item.date || item.Date || item.transaction_date || item.TxnDate || item.txn_date || item.dateTime;
        const schemeNameVal = item.schemeName || item.scheme || item.scheme_name || item.security || item.symbol || item.name || item.instrument || item.particulars || item.description;
        const isinVal = item.isin || item.ISIN || item.isin_number;
        const typeVal = item.type || item.action || item.transaction_type || item.buy_sell || item.side || item.trade_type;
        const quantityVal = item.quantity || item.units || item.qty || item.shares || item.volume;
        const priceVal = item.price || item.nav || item.rate || item.purchase_price || item.average_price;
        const amountVal = item.amount || item.value || item.net_amount || item.total_amount;
        const folioVal = item.folio || item.folio_no || item.folio_number || item.account || item.account_no;

        if (!dateVal || !schemeNameVal) continue;

        // Format date to YYYY-MM-DD
        let parsedDateStr = '';
        try {
          const dateStr = String(dateVal).trim();
          const parsed = Date.parse(dateStr);
          if (!isNaN(parsed)) {
            parsedDateStr = new Date(parsed).toISOString().split('T')[0];
          } else {
            // Try DD-MM-YYYY or DD/MM/YYYY regex
            const match = dateStr.match(/(\d{1,2})[-/ ]([A-Za-z0-9]{3,9})[-/ ](\d{2,4})/);
            if (match) {
              const day = match[1].padStart(2, '0');
              const monthStr = match[2];
              let year = match[3];
              if (year.length === 2) year = '20' + year;
              const months: Record<string, string> = {
                jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
                '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
                '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12'
              };
              const month = months[monthStr.toLowerCase().slice(0, 3)] || '01';
              parsedDateStr = `${year}-${month}-${day}`;
            }
          }
        } catch {
          continue;
        }
        if (!parsedDateStr) continue;

        const schemeName = String(schemeNameVal).trim();
        const isin = isinVal ? String(isinVal).toUpperCase().trim() : '';

        // Parse quantity, price, amount
        let quantity = parseFloat(String(quantityVal || '0').replace(/,/g, ''));
        let price = parseFloat(String(priceVal || '0').replace(/,/g, ''));
        let amount = parseFloat(String(amountVal || '0').replace(/,/g, ''));

        if (isNaN(quantity)) quantity = 0;
        if (isNaN(price)) price = 0;
        if (isNaN(amount)) amount = 0;

        if (quantity === 0 && price !== 0 && amount !== 0) {
          quantity = Math.abs(amount / price);
        } else if (price === 0 && quantity !== 0 && amount !== 0) {
          price = Math.abs(amount / quantity);
        } else if (amount === 0 && quantity !== 0 && price !== 0) {
          amount = Math.abs(quantity * price);
        }

        if (quantity === 0 && amount === 0) continue;

        // Parse transaction type
        let type: string = 'BUY';
        const typeStr = String(typeVal || '').toLowerCase();
        if (typeStr.includes('reinvest')) {
          type = 'Dividend Reinvest';
        } else if (typeStr.includes('dividend payout') || typeStr.includes('div payout')) {
          type = 'Dividend Payout';
        } else if (
          typeStr.includes('redemption') ||
          typeStr.includes('sell') ||
          typeStr.includes('repurchase') ||
          typeStr.includes('payout') ||
          typeStr.includes('switch-out') ||
          typeStr.includes('switch_out') ||
          typeStr.includes('stg-out') ||
          typeStr.includes('out') ||
          typeStr === 's' ||
          quantity < 0
        ) {
          type = 'SELL';
        }

        transactions.push({
          date: parsedDateStr,
          schemeName,
          isin,
          type,
          quantity: Math.abs(quantity),
          price: Math.abs(price),
          amount: Math.abs(amount),
          folio: folioVal ? String(folioVal).trim() : undefined
        });
      }
    } catch (jsonErr: any) {
      console.error('[CAMS Parser] Failed to parse JSON statement:', jsonErr);
      throw new Error(`Failed to parse JSON file: ${jsonErr.message}`);
    }
  } else {
    // 3. Handle Excel / CSV Statements
    console.log('[CAMS Parser] Reading Excel/CSV statement buffer.');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Scan cells to find a PAN number
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (!rows || rows.length === 0) continue;

      // Scan rows for PAN
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          if (cell) {
            const panCandidate = extractPanFromString(String(cell));
            if (panCandidate) {
              detectedPan = panCandidate;
              break;
            }
          }
        }
        if (detectedPan) break;
      }

      // Process Sheet rows to extract transactions
      let dateIdx = -1;
      let schemeIdx = -1;
      let descIdx = -1;
      let isinIdx = -1;
      let typeIdx = -1;
      let unitsIdx = -1;
      let navIdx = -1;
      let amountIdx = -1;
      let folioIdx = -1;

      // Scan first 30 rows for headers
      const scanLimit = Math.min(rows.length, 30);
      for (let r = 0; r < scanLimit; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;

        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] || '').toLowerCase().trim();
          if (val.includes('date') && !val.includes('update') && !val.includes('birth')) {
            dateIdx = c;
          } else if ((val.includes('scheme') || val.includes('fund') || val.includes('security') || val.includes('symbol') || val.includes('instrument') || val.includes('stock') || val === 'asset' || (val.includes('asset') && !val.includes('type'))) && !val.includes('isin') && !val.includes('bal') && !val.includes('desc') && !val.includes('partic')) {
            schemeIdx = c;
          } else if ((val.includes('description') || val.includes('particular')) && !val.includes('isin') && !val.includes('bal') && descIdx === -1) {
            descIdx = c;
          } else if (val.includes('isin')) {
            isinIdx = c;
          } else if (((val.includes('type') && !val.includes('asset')) || val.includes('transaction') || val.includes('nature') || val.includes('action') || val.includes('buy') || val.includes('sell')) && !val.includes('asset')) {
            typeIdx = c;
          } else if ((val.includes('unit') || val.includes('qty') || val.includes('quantity') || val.includes('shares')) && !val.includes('balance') && !val.includes('bal')) {
            unitsIdx = c;
          } else if ((val.includes('nav') || val.includes('price') || val.includes('rate')) && !val.includes('balance') && !val.includes('bal')) {
            navIdx = c;
          } else if ((val.includes('amount') || val.includes('net amt') || val.includes('value') || val.includes('amt') || val.includes('cost')) && !val.includes('balance') && !val.includes('bal')) {
            amountIdx = c;
          } else if (val.includes('folio') || val.includes('account')) {
            folioIdx = c;
          }
        }

        if (dateIdx !== -1 && (schemeIdx !== -1 || isinIdx !== -1) && (unitsIdx !== -1 || amountIdx !== -1)) {
          break;
        }
      }

      // Fallback to description column if no explicit scheme column is found
      if (schemeIdx === -1 && descIdx !== -1) {
        schemeIdx = descIdx;
      }

      // Default/robust fallbacks for individual column indices if they weren't found
      if (dateIdx === -1) dateIdx = 0;
      if (schemeIdx === -1) {
        schemeIdx = [1, 2, 3, 4, 5, 0].find(idx => idx !== dateIdx && idx !== unitsIdx && idx !== navIdx && idx !== amountIdx && idx !== typeIdx) ?? 1;
      }
      if (typeIdx === -1) {
        typeIdx = [2, 1, 3, 4, 5, 0].find(idx => idx !== dateIdx && idx !== schemeIdx && idx !== unitsIdx && idx !== navIdx && idx !== amountIdx) ?? 2;
      }
      if (amountIdx === -1) {
        amountIdx = [3, 4, 5, 1, 2, 0].find(idx => idx !== dateIdx && idx !== schemeIdx && idx !== unitsIdx && idx !== navIdx && idx !== typeIdx) ?? 3;
      }
      if (unitsIdx === -1) {
        unitsIdx = [4, 5, 3, 1, 2, 0].find(idx => idx !== dateIdx && idx !== schemeIdx && idx !== navIdx && idx !== amountIdx && idx !== typeIdx) ?? 4;
      }
      if (navIdx === -1) {
        navIdx = [5, 4, 3, 1, 2, 0].find(idx => idx !== dateIdx && idx !== schemeIdx && idx !== unitsIdx && idx !== amountIdx && idx !== typeIdx) ?? 5;
      }

      let currentSchemeName = '';
      let currentIsin = '';
      let currentFolio = '';

      const folioRegexes = [
        /\((?:folio|folio\s*no\.?|folio\s*number)?\s*[:\-]?\s*([0-9]{4,12}(?:\s*\/\s*[0-9]{1,4})?)\)/i,
        /\b(?:folio|folio\s*no\.?|folio\s*number)\s*[:\-]?\s*([0-9]{4,12}(?:\s*\/\s*[0-9]{1,4})?)\b/i,
        /\b([0-9]{6,12}\s*\/\s*[0-9]{1,4})\b/
      ];

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row) || row.length < 2) continue;

        // Scan cell-by-cell in the current row to capture active metadata (scheme, ISIN, folio)
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;
          const cellStr = String(cell).trim();
          
          // Match ISIN
          const isinMatch = cellStr.match(/\bINF[A-Z0-9]{9}\b/i) || cellStr.match(/\bINE[A-Z0-9]{9}\b/i);
          if (isinMatch) {
            currentIsin = isinMatch[0].toUpperCase();
          }

          // Match Folio in this cell
          for (const regex of folioRegexes) {
            const fMatch = cellStr.match(regex);
            if (fMatch) {
              currentFolio = fMatch[1].replace(/\s+/g, '');
              break;
            }
          }

          // Match Scheme Name
          // Skip cell-by-cell scheme name matching if this column is explicitly mapped to another role
          const isMappedToOtherRole = 
            (c === descIdx && schemeIdx !== descIdx) ||
            (c === typeIdx && schemeIdx !== typeIdx) ||
            c === dateIdx ||
            c === unitsIdx ||
            c === navIdx ||
            c === amountIdx ||
            c === folioIdx;

          if (!isMappedToOtherRole) {
            const lowerCell = cellStr.toLowerCase();
            if (
              cellStr.length > 5 && cellStr.length < 120 &&
              (lowerCell.includes('fund') || lowerCell.includes('plan') || lowerCell.includes('growth') || lowerCell.includes('equity') || lowerCell.includes('index') || lowerCell.includes('shares') || lowerCell.includes('ltd') || lowerCell.includes('limited')) &&
              !lowerCell.includes('total') && !lowerCell.includes('balance') && !lowerCell.includes('portfolio') && !lowerCell.includes('statement') && !lowerCell.includes('account') &&
              !lowerCell.match(/\d{1,2}-\w{3}-\d{4}/) && !lowerCell.match(/\d{4}-\d{2}-\d{2}/)
            ) {
              const { cleanedName, extractedFolio } = cleanSchemeName(cellStr);
              currentSchemeName = cleanedName;
              if (extractedFolio) {
                currentFolio = extractedFolio;
              }
            }
          }
        }

        const rawDate = row[dateIdx];
        const rawScheme = row[schemeIdx];
        const rawIsin = isinIdx !== -1 ? row[isinIdx] : undefined;
        const rawType = typeIdx !== -1 ? row[typeIdx] : undefined;
        const rawUnits = unitsIdx !== -1 ? row[unitsIdx] : undefined;
        const rawNav = navIdx !== -1 ? row[navIdx] : undefined;
        const rawAmount = amountIdx !== -1 ? row[amountIdx] : undefined;
        const rawFolio = folioIdx !== -1 ? row[folioIdx] : undefined;

        if (!rawDate) {
          continue;
        }

        // Parse Date
        let parsedDateStr = '';
        if (typeof rawDate === 'number') {
          try {
            const ssf = XLSX.SSF || (XLSX as any).default?.SSF;
            const dateObj = ssf.parse_date_code(rawDate);
            const y = dateObj.y;
            const m = String(dateObj.m).padStart(2, '0');
            const d = String(dateObj.d).padStart(2, '0');
            parsedDateStr = `${y}-${m}-${d}`;
          } catch (err: any) {
            continue;
          }
        } else if (rawDate instanceof Date) {
          parsedDateStr = rawDate.toISOString().split('T')[0];
        } else {
          const dateStr = String(rawDate).trim();
          if (!dateStr || dateStr.toLowerCase().includes('date') || dateStr.toLowerCase().includes('statement') || dateStr.toLowerCase().includes('report')) continue;

          const numVal = parseFloat(dateStr);
          if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
            try {
              const ssf = XLSX.SSF || (XLSX as any).default?.SSF;
              const dateObj = ssf.parse_date_code(numVal);
              const y = dateObj.y;
              const m = String(dateObj.m).padStart(2, '0');
              const d = String(dateObj.d).padStart(2, '0');
              parsedDateStr = `${y}-${m}-${d}`;
            } catch {}
          }

          if (!parsedDateStr) {
            const parsed = Date.parse(dateStr);
            if (!isNaN(parsed)) {
              parsedDateStr = new Date(parsed).toISOString().split('T')[0];
            } else {
              const match = dateStr.match(/(\d{1,2})[-/ ]([A-Za-z0-9]{3,9})[-/ ](\d{2,4})/);
              if (match) {
                const day = match[1].padStart(2, '0');
                const monthStr = match[2];
                let year = match[3];
                if (year.length === 2) year = '20' + year;

                const months: Record<string, string> = {
                  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
                  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05', '06': '06',
                  '07': '07', '08': '08', '09': '09', '10': '10', '11': '11', '12': '12'
                };
                const month = months[monthStr.toLowerCase().slice(0, 3)] || '01';
                parsedDateStr = `${year}-${month}-${day}`;
              } else {
                continue;
              }
            }
          }
        }

        // If we got a valid transaction date, let's construct the transaction
        let schemeName = '';
        const rawSchemeStr = String(rawScheme || '').trim();
        const lowerRaw = rawSchemeStr.toLowerCase();
        const isTxDescription = 
          lowerRaw === 'purchase' ||
          lowerRaw === 'new purchase' ||
          lowerRaw === 'redemption' ||
          lowerRaw === 'sell' ||
          lowerRaw === 'buy' ||
          lowerRaw === 'dividend' ||
          lowerRaw === 'dividend payout' ||
          lowerRaw === 'reinvestment' ||
          lowerRaw === 'stamp duty' ||
          lowerRaw === 'stt' ||
          lowerRaw === 'tax' ||
          lowerRaw.includes('trxn.ref') ||
          lowerRaw.includes('ref.no') ||
          lowerRaw.includes('stamp_duty') ||
          lowerRaw.includes('brokerage') ||
          lowerRaw.includes('switch out') ||
          lowerRaw.includes('switch-out') ||
          lowerRaw.includes('switch in') ||
          lowerRaw.includes('switch-in') ||
          lowerRaw.includes('systematic') ||
          lowerRaw.includes('emandate') ||
          lowerRaw.includes('rejection');

        if (rawSchemeStr.length > 3 && !isTxDescription) {
          const { cleanedName, extractedFolio } = cleanSchemeName(rawSchemeStr);
          schemeName = cleanedName;
          if (extractedFolio) {
            currentFolio = extractedFolio;
          }
        } else {
          schemeName = currentSchemeName;
        }

        const lowerScheme = schemeName.toLowerCase();
        if (
          !schemeName ||
          lowerScheme === 'description' ||
          lowerScheme === 'particulars' ||
          lowerScheme === 'transaction type' ||
          lowerScheme.includes('total') ||
          lowerScheme.includes('balance') ||
          lowerScheme.includes('portfolio') ||
          lowerScheme.includes('opening') ||
          lowerScheme.includes('closing') ||
          lowerScheme.includes('stamp duty') ||
          lowerScheme.includes('stamp_duty') ||
          lowerScheme.includes('stt') ||
          lowerScheme.includes('brokerage') ||
          lowerScheme.includes('charges')
        ) {
          continue;
        }

        // Find ISIN
        let isin = '';
        if (rawIsin) {
          isin = String(rawIsin).toUpperCase().trim();
        } else if (currentIsin) {
          isin = currentIsin;
        } else {
          for (const cell of row) {
            const cellStr = String(cell || '');
            const match = cellStr.match(/INF[A-Z0-9]{9}/i) || cellStr.match(/INE[A-Z0-9]{9}/i);
            if (match) {
              isin = match[0].toUpperCase();
              break;
            }
          }
        }

        // Parse quantity, price, amount
        let quantity = parseFloat(String(rawUnits || '0').replace(/,/g, ''));
        let price = parseFloat(String(rawNav || '0').replace(/,/g, ''));
        let amount = parseFloat(String(rawAmount || '0').replace(/,/g, ''));

        if (isNaN(quantity)) quantity = 0;
        if (isNaN(price)) price = 0;
        if (isNaN(amount)) amount = 0;

        if (quantity === 0 && price !== 0 && amount !== 0) {
          quantity = Math.abs(amount / price);
        } else if (price === 0 && quantity !== 0 && amount !== 0) {
          price = Math.abs(amount / quantity);
        } else if (amount === 0 && quantity !== 0 && price !== 0) {
          amount = Math.abs(quantity * price);
        }

        // Skip non-payout rows with zero or near-zero quantity (e.g. stamp duty)
        const isDividendPayout = String(rawType || '').toLowerCase().includes('payout') || String(row.join(' ')).toLowerCase().includes('payout');
        if (Math.abs(quantity) < 0.0001 && !isDividendPayout) {
          continue;
        }

        if (quantity === 0 && amount === 0) {
          continue;
        }

        // Type
        let type: string = 'BUY';
        const typeStr = String(rawType || '').toLowerCase();
        const descStr = String(row.join(' ')).toLowerCase();

        if (typeStr.includes('reinvest') || descStr.includes('reinvest')) {
          type = 'Dividend Reinvest';
        } else if (typeStr.includes('dividend payout') || descStr.includes('dividend payout') || descStr.includes('div payout')) {
          type = 'Dividend Payout';
        } else if (
          typeStr.includes('redemption') ||
          typeStr.includes('sell') ||
          typeStr.includes('repurchase') ||
          typeStr.includes('payout') ||
          typeStr.includes('switch-out') ||
          typeStr.includes('switch_out') ||
          typeStr.includes('stg-out') ||
          typeStr.includes('out') ||
          typeStr === 's' ||
          descStr.includes('redemption') ||
          descStr.includes('sell') ||
          descStr.includes('payout') ||
          quantity < 0
        ) {
          type = 'SELL';
        }

        const finalFolio = rawFolio ? String(rawFolio).trim() : (currentFolio || undefined);

        transactions.push({
          date: parsedDateStr,
          schemeName,
          isin,
          type,
          quantity: Math.abs(quantity),
          price: Math.abs(price),
          amount: Math.abs(amount),
          folio: finalFolio
        });
      }
    }
  }

  // 4. Automatically Resolve/Fetch ISINs from the net for all transactions missing a valid ISIN
  console.log(`[CAMS Parser] Loaded ${transactions.length} transactions. Resolving missing ISINs from net...`);
  for (const tx of transactions) {
    const cleanIsin = (tx.isin || '').toUpperCase().trim();
    const needsResolution = !cleanIsin || cleanIsin.startsWith('INFCS') || cleanIsin.length < 12;
    if (needsResolution) {
      try {
        const resolved = await fetchRealIsinFromNet(tx.schemeName);
        if (resolved) {
          tx.isin = resolved;
        } else {
          // Fallback to generate a temporary but persistent mock isin
          let hash = 0;
          const upperScheme = tx.schemeName.toUpperCase();
          for (let i = 0; i < upperScheme.length; i++) {
            hash = (hash << 5) - hash + upperScheme.charCodeAt(i);
            hash |= 0;
          }
          tx.isin = 'INF' + Math.abs(hash).toString(36).toUpperCase().padStart(9, 'X').slice(0, 9);
        }
      } catch (err) {
        console.warn(`[CAMS Parser] Failed to automatically fetch ISIN for "${tx.schemeName}":`, err);
      }
    }
  }

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { transactions, detectedPan: detectedPan || fallbackPan || 'PANMF7777F' };
}

/**
 * Fetches standard AMFI Scheme Code to ISIN/Name mappings from AMFI.
 */
export async function fetchAMFISchemeCodes(): Promise<{
  isinToCode: Map<string, string>;
  nameToCode: Map<string, string>;
  codeToNav: Map<string, number>;
}> {
  const now = Date.now();
  if (cachedSchemeCodes && (now - cachedSchemeCodesTime < AMFI_CACHE_TTL)) {
    console.log('[AMFI Code Mapping] Returning cached scheme mappings.');
    return cachedSchemeCodes;
  }
  const isinToCode = new Map<string, string>();
  const nameToCode = new Map<string, string>();
  const codeToNav = new Map<string, number>();

  try {
    const response = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      throw new Error(`AMFI returned status ${response.status}`);
    }
    const text = await response.text();
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Scheme Code') || trimmed.includes('Open Ended Schemes')) {
        continue;
      }
      const parts = trimmed.split(';');
      if (parts.length >= 5) {
        const schemeCode = parts[0]?.trim();
        const isinGrowth = parts[1]?.trim();
        const isinReinvest = parts[2]?.trim();
        const schemeName = parts[3]?.trim();
        const navStr = parts[4]?.trim();
        const nav = parseFloat(navStr || '');

        if (schemeCode) {
          if (!isNaN(nav) && nav > 0) {
            codeToNav.set(schemeCode, nav);
          }
          if (isinGrowth && isinGrowth !== '-') {
            isinToCode.set(isinGrowth.toUpperCase(), schemeCode);
          }
          if (isinReinvest && isinReinvest !== '-') {
            isinToCode.set(isinReinvest.toUpperCase(), schemeCode);
          }
          if (schemeName) {
            const upperScheme = schemeName.toUpperCase();
            nameToCode.set(upperScheme, schemeCode);
            const normalized = upperScheme.replace(/\s+/g, ' ').trim();
            nameToCode.set(normalized, schemeCode);
          }
        }
      }
    }
    console.log(`[AMFI Code Mapping] Successfully built scheme mappings. Size: ISIN->Code (${isinToCode.size}), Name->Code (${nameToCode.size})`);
    cachedSchemeCodes = { isinToCode, nameToCode, codeToNav };
    cachedSchemeCodesTime = now;
  } catch (err) {
    console.error('[AMFI Code Mapping] Failed to fetch scheme codes:', err);
  }

  return { isinToCode, nameToCode, codeToNav };
}

/**
 * Fetches the latest NAV for a mutual fund holding from MFapi.in.
 * Falls back to name-based searching on MFapi.in if no direct code mapping is found.
 */
export async function fetchNAVFromMFapi(
  isin: string,
  symbol: string,
  maps?: { isinToCode: Map<string, string>; nameToCode: Map<string, string>; codeToNav?: Map<string, number> }
): Promise<{ nav: number; prevNav?: number; source: string; schemeCode?: string } | null> {
  const cleanIsin = (isin || '').toUpperCase().trim();
  const cleanSymbol = (symbol || '').toUpperCase().trim();

  // Skip non-Mutual Funds (e.g. ULIPs, Insurance policies, Stocks/ETFs with INE/IN9 ISIN, or equity tickers)
  const isUlipOrInsurance = cleanSymbol.startsWith('UL-') || cleanSymbol.startsWith('ULIP') || 
                            cleanSymbol.includes('HORIZON') || cleanSymbol.includes('POLICY') || 
                            cleanSymbol.includes('INSURANCE');
  const isStockOrEtf = cleanIsin.startsWith('INE') || cleanIsin.startsWith('IN9') || 
                       cleanSymbol === 'GOLDSHARE' || cleanSymbol === 'GOLDBEES' || cleanSymbol === 'NIFTYBEES' ||
                       cleanSymbol === 'BANKBEES';

  if (isUlipOrInsurance || isStockOrEtf) {
    return null;
  }

  let schemeCode: string | undefined;

  // 1. Try to find schemeCode using AMFI mapping
  if (maps) {
    const normalizedSymbol = cleanSymbol.replace(/\s+/g, ' ').trim();

    schemeCode = maps.isinToCode.get(cleanIsin) || 
                 maps.nameToCode.get(cleanSymbol) || 
                 maps.nameToCode.get(normalizedSymbol);
  }


  // 2. If no schemeCode was found, try to search on MFapi.in using symbol / schemeName
  if (!schemeCode && symbol) {
    try {
      // Clean symbol of extra plan/option/demat/parentheses words to make search concise and matching
      const searchTerms = symbol
        .replace(/\([^)]*\)/g, '') // Remove (Non Demat), (Demat), etc.
        .replace(/-(Growth|Dividend|Direct|Regular|Option|Plan|IDCW|Payout|Reinvestment)/gi, ' ')
        .replace(/\b(GROWTH|DIVIDEND|DIRECT|REGULAR|OPTION|PLAN|IDCW|PAYOUT|REINVESTMENT|NON|DEMAT)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (searchTerms.length >= 3) {
        console.log(`[MFapi] Searching MFapi.in for "${searchTerms}"...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const response = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(searchTerms)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const results = await response.json();
          if (Array.isArray(results) && results.length > 0) {
            // Find closest name match or fallback to the first one
            let bestMatch = results[0];
            const upperSearch = searchTerms.toUpperCase();
            for (const res of results) {
              const cleanResName = String(res.schemeName || '').toUpperCase().replace(/\s+/g, ' ').trim();
              if (cleanResName.includes(upperSearch)) {
                bestMatch = res;
                break;
              }
            }
            if (bestMatch && bestMatch.schemeCode) {
              schemeCode = String(bestMatch.schemeCode);
              console.log(`[MFapi] Resolved scheme code ${schemeCode} for "${symbol}" via MFapi search.`);
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log(`[MFapi] Search timeout for "${symbol}".`);
      } else {
        console.log(`[MFapi] Search skipped/failed for "${symbol}":`, err instanceof Error ? err.message : err);
      }
    }
  }


  // 3. If we have a schemeCode, fetch recent NAVs from MFapi.in
  if (schemeCode) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const json = await response.json();
        if (json.status === 'SUCCESS' && Array.isArray(json.data) && json.data.length > 0) {
          const navStr = json.data[0].nav;
          const nav = parseFloat(navStr);
          let prevNav: number | undefined = undefined;
          if (json.data.length > 1 && json.data[1].nav) {
            const pNav = parseFloat(json.data[1].nav);
            if (!isNaN(pNav) && pNav > 0) prevNav = pNav;
          }
          if (!isNaN(nav) && nav > 0) {
            return { nav, prevNav, source: 'MFapi.in', schemeCode };
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log(`[MFapi] NAV fetch timeout for schemeCode ${schemeCode}.`);
      } else {
        console.log(`[MFapi] Failed to fetch latest NAV for schemeCode ${schemeCode}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Fallback to AMFI cached NAV if MFapi fetch failed or yielded no results
  if (schemeCode && maps?.codeToNav) {
    const cachedNav = maps.codeToNav.get(schemeCode);
    if (cachedNav && cachedNav > 0) {
      return { nav: cachedNav, source: 'AMFI (Fallback)', schemeCode };
    }
  }

  return null;
}

export interface PdfSummaryScheme {
  schemeName: string;
  isin: string;
  folio: string;
  pdfQuantity: number;
  pdfNav: number;
  pdfValue: number;
  pdfCost?: number;
}

/**
 * Parses raw extracted PDF text to locate the holdings summary table (typically on Page 1 or 2).
 * Finds closing balances, latest NAVs, valuations, and cost of investment for each scheme.
 */
export function extractSummaryFromPdfText(text: string): PdfSummaryScheme[] {
  const schemes: PdfSummaryScheme[] = [];
  const lines = text.split('\n');
  
  let currentSchemeName = '';
  let currentIsin = '';
  let currentFolio = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for ISIN on this line
    const isinMatch = line.match(/\bINF[A-Z0-9]{9}\b/i);
    if (isinMatch) {
      currentIsin = isinMatch[0].toUpperCase();
    }
    
    // Check for folio on this line
    const folioRegexes = [
      /(?:folio|folio\s*no\.?|folio\s*number)?\s*[:\-]?\s*\b([0-9]{4,12}(?:\s*[\/\-]\s*[0-9]{1,4})?)\b/i,
      /\b([0-9]{6,12}\s*[\/\-]\s*[0-9]{1,4})\b/
    ];
    for (const r of folioRegexes) {
      const match = line.match(r);
      if (match) {
        currentFolio = match[1].replace(/\s+/g, '');
        break;
      }
    }
    
    // Detect Scheme Name line using expanded keywords to cover all mutual fund categories
    const lowerLine = line.toLowerCase();
    const mfKeywords = [
      'fund', 'plan', 'growth', 'equity', 'index', 'direct', 'emerging', 'midcap', 'smallcap', 'largecap',
      'tax', 'hybrid', 'elss', 'bond', 'gilt', 'liquid', 'savings', 'opportunities', 'bluechip', 'dynamic',
      'focused', 'arbitrage', 'retirement', 'pension', 'value', 'contra', 'balanced', 'debt', 'overnight',
      'money', 'corporate', 'banking', 'capital', 'infrastructure', 'pharma', 'fmcg', 'technology', 'gold',
      'silver', 'commodity', 'allocator', 'asset', 'esg', 'active', 'passive', 'treasury', 'dividend', 'income',
      'inf' // to capture lines with ISIN directly
    ];
    const containsMfKeyword = mfKeywords.some(keyword => lowerLine.includes(keyword));

    const isSchemeLine = 
      line.length > 10 &&
      line.length < 200 &&
      containsMfKeyword &&
      !lowerLine.includes('total') &&
      !lowerLine.includes('statement') &&
      !lowerLine.includes('account') &&
      !lowerLine.includes('trans') &&
      !lowerLine.includes('particulars') &&
      !lowerLine.includes('description') &&
      !lowerLine.match(/\b(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{2,4})\b/);
      
    if (isSchemeLine) {
      const { cleanedName, extractedFolio } = cleanSchemeName(line);
      if (cleanedName.length > 10) {
        currentSchemeName = cleanedName;
        if (extractedFolio) {
          currentFolio = extractedFolio;
        }
        if (!line.match(/\bINF[A-Z0-9]{9}\b/i)) {
          currentIsin = ''; // reset
        }
        
        // Let's scan the next 15 lines for the summary data of this scheme
        let pdfQuantity = 0;
        let pdfNav = 0;
        let pdfValue = 0;
        let pdfCost: number | undefined = undefined;
        
        for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
          const sLine = lines[j].trim();
          if (!sLine) continue;
          
          // Check for ISIN / folio in these adjacent lines
          const subIsin = sLine.match(/\bINF[A-Z0-9]{9}\b/i);
          if (subIsin && !currentIsin) currentIsin = subIsin[0].toUpperCase();
          
          for (const r of folioRegexes) {
            const match = sLine.match(r);
            if (match && !currentFolio) {
              currentFolio = match[1].replace(/\s+/g, '');
              break;
            }
          }
          
          // Look for explicit labels with permissive numeric regexes
          const qtyMatch = sLine.match(/(?:balance|closing\s*balance|units|qty|quantity|units\s*held|holding)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
          if (qtyMatch && !pdfQuantity) {
            pdfQuantity = parseFloat(qtyMatch[1].replace(/,/g, ''));
          }
          
          const navMatch = sLine.match(/(?:nav|latest\s*nav|current\s*nav|price|rate)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
          if (navMatch && !pdfNav) {
            pdfNav = parseFloat(navMatch[1].replace(/,/g, ''));
          }
          
          const valMatch = sLine.match(/(?:market\s*value|valuation|current\s*value|value)\s*[:\-]?\s*(?:rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
          if (valMatch && !pdfValue) {
            pdfValue = parseFloat(valMatch[1].replace(/,/g, ''));
          }
          
          const costMatch = sLine.match(/(?:cost\s*of\s*investment|invested\s*value|invested\s*amount|amount\s*invested|purchase\s*cost|avg\s*cost|average\s*cost|cost\s*value|cost|purchase\s*value)\s*[:\-]?\s*(?:rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
          if (costMatch && pdfCost === undefined) {
            pdfCost = parseFloat(costMatch[1].replace(/,/g, ''));
          }
          
          // Look for 3-4 numbers on a line (tabular row fallback) with support for integers and any decimals
          const rawNumStrings = sLine.match(/\b[\d,]+(?:\.\d+)?\b/g) || [];
          const parsedNums = rawNumStrings
            .map(n => parseFloat(n.replace(/,/g, '')))
            .filter(n => !isNaN(n) && n > 0);
          if (parsedNums.length >= 3) {
            for (let x = 0; x < parsedNums.length; x++) {
              for (let y = 0; y < parsedNums.length; y++) {
                if (x === y) continue;
                const prod = parsedNums[x] * parsedNums[y];
                for (let z = 0; z < parsedNums.length; z++) {
                  if (z === x || z === y) continue;
                  const diffRatio = Math.abs(prod - parsedNums[z]) / parsedNums[z];
                  if (diffRatio < 0.05) {
                    pdfQuantity = parsedNums[x];
                    pdfNav = parsedNums[y];
                    pdfValue = parsedNums[z];
                    
                    if (parsedNums.length >= 4) {
                      const usedIndices = [x, y, z];
                      const unused = parsedNums.filter((_, idx) => !usedIndices.includes(idx));
                      if (unused.length > 0) {
                        pdfCost = unused[0];
                      }
                    }
                    break;
                  }
                }
              }
            }
          }
          
          if (pdfQuantity > 0 && pdfNav > 0 && pdfCost !== undefined) {
            if (!pdfValue) pdfValue = pdfQuantity * pdfNav;
            break;
          }
        }
        
        if (pdfQuantity > 0) {
          schemes.push({
            schemeName: currentSchemeName,
            isin: currentIsin || currentSchemeName,
            folio: currentFolio,
            pdfQuantity,
            pdfNav,
            pdfValue,
            pdfCost
          });
        }
      }
    }
  }
  return schemes;
}


