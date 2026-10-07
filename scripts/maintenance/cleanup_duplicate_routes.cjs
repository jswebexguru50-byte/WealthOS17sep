const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../../server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('Initial server.ts size:', content.length);

// 1. Remove naive duplicate GET /api/dashboard/effective-holdings (near line 357)
const target1 = `app.get('/api/dashboard/effective-holdings', async (req, res) => {
  try {
    const portfolioQuery = req.query.portfolio ? String(req.query.portfolio).split(',') : null;
    const effective = await LookthroughService.getInstance().computeEffectiveHoldings(portfolioQuery);
    res.json({ success: true, effective_holdings: effective, data: effective });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});`;

// 2. Remove legacy duplicate GET /api/scrip-intelligence (near line 11909)
const target2Start = `// GET /api/scrip-intelligence
app.get('/api/scrip-intelligence', async (req, res) => {`;
const target2End = `    res.json({
      success: true,
      symbol: cleanSym,
      company_name: screenerData?.company_name || cleanSym,
      screener: screenerData,
      social: socialItems,
      tickerInfo,
      technicalAnalysis,
      newsSentiment,
      signalResult,
      portfolioContext
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});`;

// 3. Remove naive duplicate GET /api/pms/reconcile-dividends (near line 12683)
const target3 = `// GET /api/pms/reconcile-dividends?portfolio=cc9
// Returns expected dividends from CorporateActions vs received DIVIDEND txns
app.get('/api/pms/reconcile-dividends', async (req, res) => {
  try {
    const portfolio = String(req.query.portfolio || '');
    if (!portfolio) return res.json({ success: false, message: 'Portfolio required' });

    // Expected dividends from CorporateActions (DIVIDEND type)
    const caRows = await dbAll(db,
      \`SELECT ca.symbol, ca.isin, ca.record_date as date, ca.numerator as dps
       FROM CorporateActions ca
       WHERE ca.action_type = 'DIVIDEND'
       ORDER BY ca.record_date DESC\`,
      []
    );

    // Get holdings quantities at each dividend date
    const expected: any[] = [];
    for (const ca of caRows) {
      const holdingRow = await dbGet(db,
        \`SELECT quantity FROM Holdings WHERE portfolio = ? AND (symbol = ? OR isin = ?)\`,
        [portfolio, ca.symbol, ca.isin]
      ) as any;
      if (!holdingRow || !holdingRow.quantity) continue;
      const dps = ca.dps || 0;
      const amount = Math.round(holdingRow.quantity * dps);
      if (amount <= 0) continue;
      expected.push({ date: ca.date, symbol: ca.symbol, isin: ca.isin, qtyHeld: holdingRow.quantity, dps, amount });
    }

    // Received dividends in Transactions
    const received = await dbAll(db,
      \`SELECT date, SUM(net_amount) as amount FROM Transactions
       WHERE portfolio = ? AND type IN ('DIVIDEND','CASH_INCOME','INTEREST')
       GROUP BY date ORDER BY date DESC\`,
      [portfolio]
    );

    res.json({ success: true, expected, received });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});`;

// 4. Remove duplicate aliases for tickers (near line 14150)
const target4Start = `// 18. Alias GET /api/tickers
app.get('/api/tickers', async (req, res) => {`;
const target4End = `// Sync Sectors endpoint
app.post('/api/tickers/sync-sectors', async (req, res) => {
  try {
    const result = await syncSectorsForTickers(db);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});`;

function removeBlock(source, startPattern, endPattern, label) {
  const startIdx = source.indexOf(startPattern);
  if (startIdx === -1) {
    console.warn(`[WARN] startPattern not found for ${label}`);
    return source;
  }
  const endIdx = source.indexOf(endPattern, startIdx);
  if (endIdx === -1) {
    console.warn(`[WARN] endPattern not found for ${label}`);
    return source;
  }
  const fullEnd = endIdx + endPattern.length;
  console.log(`[OK] Removed duplicate block ${label} (${fullEnd - startIdx} chars)`);
  return source.slice(0, startIdx) + source.slice(fullEnd);
}

// Target 1
const t1CRLF = target1.replace(/\r?\n/g, '\r\n');
const t1LF = target1.replace(/\r?\n/g, '\n');
if (content.includes(t1CRLF)) {
  content = content.replace(t1CRLF, '');
  console.log('[OK] Removed duplicate target 1 (effective-holdings)');
} else if (content.includes(t1LF)) {
  content = content.replace(t1LF, '');
  console.log('[OK] Removed duplicate target 1 (LF)');
} else {
  console.warn('[WARN] target 1 not found');
}

// Target 2
content = removeBlock(content, target2Start.replace(/\r?\n/g, '\r\n'), target2End.replace(/\r?\n/g, '\r\n'), 'target 2 (scrip-intelligence)');

// Target 3
const t3CRLF = target3.replace(/\r?\n/g, '\r\n');
const t3LF = target3.replace(/\r?\n/g, '\n');
if (content.includes(t3CRLF)) {
  content = content.replace(t3CRLF, '');
  console.log('[OK] Removed duplicate target 3 (reconcile-dividends)');
} else if (content.includes(t3LF)) {
  content = content.replace(t3LF, '');
  console.log('[OK] Removed duplicate target 3 (LF)');
} else {
  console.warn('[WARN] target 3 not found');
}

// Target 4
content = removeBlock(content, target4Start.replace(/\r?\n/g, '\r\n'), target4End.replace(/\r?\n/g, '\r\n'), 'target 4 (tickers aliases)');

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Final server.ts size:', content.length);
