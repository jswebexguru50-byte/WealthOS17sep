const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '../../server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('Original server.ts size:', content.length);

// 1. Line 710: /api/unlisted-assets/update-valuation
const target1 = `    // 2. Update Holdings
    const holdings = await dbAll(db, "SELECT * FROM Holdings WHERE symbol = ?", [cleanSym]);
    for (const h of holdings) {
      const newCurrentValue = Number(h.quantity || 0) * ltpNum;
      const totalCost = Number(h.total_cost || 0);
      const unrealizedPnl = newCurrentValue - totalCost;
      const pnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;
      await dbRun(db, \`
        UPDATE Holdings 
        SET ltp = ?, current_value = ?, unrealized_pnl = ?, pnl_pct = ?, data_source = 'Unlisted Valuation', last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      \`, [ltpNum, newCurrentValue, unrealizedPnl, pnlPct, h.id]);
    }`;

const repl1 = `    // 2. Update Holdings (batched in transaction)
    const holdings = await dbAll(db, "SELECT * FROM Holdings WHERE symbol = ?", [cleanSym]);
    if (holdings.length > 0) {
      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        for (const h of holdings) {
          const newCurrentValue = Number(h.quantity || 0) * ltpNum;
          const totalCost = Number(h.total_cost || 0);
          const unrealizedPnl = newCurrentValue - totalCost;
          const pnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;
          await dbRun(db, \`
            UPDATE Holdings 
            SET ltp = ?, current_value = ?, unrealized_pnl = ?, pnl_pct = ?, data_source = 'Unlisted Valuation', last_updated = CURRENT_TIMESTAMP
            WHERE id = ?
          \`, [ltpNum, newCurrentValue, unrealizedPnl, pnlPct, h.id]);
        }
        await dbRun(db, 'COMMIT');
      } catch (err) {
        await dbRun(db, 'ROLLBACK').catch(() => {});
        throw err;
      }
    }`;

// 2. Line 3272: /api/tickers/:id
const target2 = `      for (const h of affectedHoldings) {
        const cv = h.quantity * ltpVal;
        const pnl = cv - h.total_cost;
        const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
        await dbRun(
          db,
          \`UPDATE Holdings SET ltp = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
           data_source = 'Manual Entry', last_update = CURRENT_TIMESTAMP
           WHERE rowid = ?\`,
          [ltpVal, cv, pnl, pct, h.rowid]
        );
      }`;

const repl2 = `      if (affectedHoldings.length > 0) {
        await dbRun(db, 'BEGIN IMMEDIATE');
        try {
          for (const h of affectedHoldings) {
            const cv = h.quantity * ltpVal;
            const pnl = cv - h.total_cost;
            const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
            await dbRun(
              db,
              \`UPDATE Holdings SET ltp = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?,
               data_source = 'Manual Entry', last_update = CURRENT_TIMESTAMP
               WHERE rowid = ?\`,
              [ltpVal, cv, pnl, pct, h.rowid]
            );
          }
          await dbRun(db, 'COMMIT');
        } catch (err) {
          await dbRun(db, 'ROLLBACK').catch(() => {});
          throw err;
        }
      }`;

// 3. Line 6805: /api/master-tickers/:id
const target3 = `      const matchHoldings = await dbAll(db, 'SELECT portfolio, isin, symbol, quantity, total_cost FROM Holdings WHERE symbol = ? OR isin = ?', [symbol, isin]);
      for (const h of matchHoldings) {
        const cv = h.quantity * manual_ltp;
        const pnl = cv - h.total_cost;
        const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
        await dbRun(db, \`
          UPDATE Holdings
          SET ltp = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?, data_source = 'Manual Entry', last_update = CURRENT_TIMESTAMP
          WHERE portfolio = ? AND isin = ? AND symbol = ? AND folio = ?
        \`, [manual_ltp, cv, pnl, pct, h.portfolio, h.isin, h.symbol, h.folio || 'NA']);
      }`;

const repl3 = `      const matchHoldings = await dbAll(db, 'SELECT portfolio, isin, symbol, quantity, total_cost FROM Holdings WHERE symbol = ? OR isin = ?', [symbol, isin]);
      if (matchHoldings.length > 0) {
        await dbRun(db, 'BEGIN IMMEDIATE');
        try {
          for (const h of matchHoldings) {
            const cv = h.quantity * manual_ltp;
            const pnl = cv - h.total_cost;
            const pct = h.total_cost > 0 ? (pnl / h.total_cost) * 100 : 0;
            await dbRun(db, \`
              UPDATE Holdings
              SET ltp = ?, current_value = ?, unrealized_pnl = ?, unrealized_pct = ?, data_source = 'Manual Entry', last_update = CURRENT_TIMESTAMP
              WHERE portfolio = ? AND isin = ? AND symbol = ? AND folio = ?
            \`, [manual_ltp, cv, pnl, pct, h.portfolio, h.isin, h.symbol, h.folio || 'NA']);
          }
          await dbRun(db, 'COMMIT');
        } catch (err) {
          await dbRun(db, 'ROLLBACK').catch(() => {});
          throw err;
        }
      }`;

// Normalize line endings for replacement
function safeReplace(source, target, replacement, label) {
  // Try CRLF first
  const targetCRLF = target.replace(/\r?\n/g, '\r\n');
  const replCRLF = replacement.replace(/\r?\n/g, '\r\n');
  if (source.includes(targetCRLF)) {
    console.log(`[OK] Replaced ${label} (CRLF match)`);
    return source.replace(targetCRLF, replCRLF);
  }
  // Try LF
  const targetLF = target.replace(/\r?\n/g, '\n');
  const replLF = replacement.replace(/\r?\n/g, '\n');
  if (source.includes(targetLF)) {
    console.log(`[OK] Replaced ${label} (LF match)`);
    return source.replace(targetLF, replLF);
  }
  console.warn(`[WARN] Target not found for ${label}`);
  return source;
}

content = safeReplace(content, target1, repl1, 'target1 (unlisted-assets)');
content = safeReplace(content, target2, repl2, 'target2 (tickers update)');
content = safeReplace(content, target3, repl3, 'target3 (master-tickers update)');

// 4. saveUserMappingsAndIsins
const target4 = `async function saveUserMappingsAndIsins(db: any, uiMappings: Record<string, string>, uiIsins: Record<string, string>) {
  for (const [raw, resolved] of Object.entries(uiMappings)) {`;

const repl4 = `async function saveUserMappingsAndIsins(db: any, uiMappings: Record<string, string>, uiIsins: Record<string, string>) {
  const entries = Object.entries(uiMappings || {});
  if (entries.length === 0) return;
  await dbRun(db, 'BEGIN IMMEDIATE');
  try {
    for (const [raw, resolved] of entries) {`;

const target4End = `      await dbRun(db, \`INSERT OR IGNORE INTO MasterTickers (symbol, name, exchange, isin) VALUES (?, ?, ?, ?)\`, 
        [resSym, resSym, 'UNKNOWN', finalIsin]);
    }
  }
}`;

const repl4End = `      await dbRun(db, \`INSERT OR IGNORE INTO MasterTickers (symbol, name, exchange, isin) VALUES (?, ?, ?, ?)\`, 
        [resSym, resSym, 'UNKNOWN', finalIsin]);
    }
    await dbRun(db, 'COMMIT');
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {});
    throw err;
  }
}`;

content = safeReplace(content, target4, repl4, 'target4 (saveUserMappingsAndIsins start)');
content = safeReplace(content, target4End, repl4End, 'target4End (saveUserMappingsAndIsins end)');

// 5. Line 10407: newTxns is_cash_flow loop
const target5 = `    const { computeIsCashFlowFlag } = await import('./src/server/xirr.js');
    const newTxns = await dbAll(db, \`SELECT id,type,portfolio,source,is_cash_flow,is_ca FROM Transactions WHERE portfolio=? AND batch_id=?\`, [portfolio, batchId]);
    for (const tx of newTxns as any[]) {
      if ((tx.is_ca||0)===1) { await dbRun(db,\`UPDATE Transactions SET is_cash_flow=0 WHERE id=?\`,[tx.id]); continue; }
      const tType = String(tx.type||'').trim().toUpperCase();
      if (tx.source==='PMS'&&(tType==='TRANSFER IN'||tType==='TRANSFER OUT')) continue;
      const expected = computeIsCashFlowFlag(tx.type,tx.portfolio,tx.source);
      if (tx.is_cash_flow!==expected) await dbRun(db,\`UPDATE Transactions SET is_cash_flow=? WHERE id=?\`,[expected,tx.id]);
    }`;

const repl5 = `    const { computeIsCashFlowFlag } = await import('./src/server/xirr.js');
    const newTxns = await dbAll(db, \`SELECT id,type,portfolio,source,is_cash_flow,is_ca FROM Transactions WHERE portfolio=? AND batch_id=?\`, [portfolio, batchId]);
    if (newTxns && newTxns.length > 0) {
      await dbRun(db, 'BEGIN IMMEDIATE');
      try {
        for (const tx of newTxns as any[]) {
          if ((tx.is_ca||0)===1) { await dbRun(db,\`UPDATE Transactions SET is_cash_flow=0 WHERE id=?\`,[tx.id]); continue; }
          const tType = String(tx.type||'').trim().toUpperCase();
          if (tx.source==='PMS'&&(tType==='TRANSFER IN'||tType==='TRANSFER OUT')) continue;
          const expected = computeIsCashFlowFlag(tx.type,tx.portfolio,tx.source);
          if (tx.is_cash_flow!==expected) await dbRun(db,\`UPDATE Transactions SET is_cash_flow=? WHERE id=?\`,[expected,tx.id]);
        }
        await dbRun(db, 'COMMIT');
      } catch (err) {
        await dbRun(db, 'ROLLBACK').catch(() => {});
        throw err;
      }
    }`;

content = safeReplace(content, target5, repl5, 'target5 (is_cash_flow batch)');

// 6. Line 10768: /api/holdings/reconcile
const target6 = `    let locked = 0;
    for (const h of holdings) {
      await dbRun(db, \`
        INSERT OR REPLACE INTO ReconciledHoldings 
          (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, reconciled_at, reconciled_by, is_locked, notes)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'manual', 1, ?)
      \`, [h.portfolio, h.isin, h.symbol, h.quantity, h.avg_buy_price, h.total_cost, note || '']);
      locked++;
    }`;

const repl6 = `    let locked = 0;
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      for (const h of holdings) {
        await dbRun(db, \`
          INSERT OR REPLACE INTO ReconciledHoldings 
            (portfolio, isin, symbol, quantity, avg_buy_price, total_cost, reconciled_at, reconciled_by, is_locked, notes)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'manual', 1, ?)
        \`, [h.portfolio, h.isin, h.symbol, h.quantity, h.avg_buy_price, h.total_cost, note || '']);
        locked++;
      }
      await dbRun(db, 'COMMIT');
    } catch (err) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw err;
    }`;

content = safeReplace(content, target6, repl6, 'target6 (holdings reconcile)');

// 7. Line 13539: /api/import/confirm items loop
const target7 = `    const batchCounts: Record<string, number> = {};

    for (const row of items) {`;

const repl7 = `    const batchCounts: Record<string, number> = {};

    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      for (const row of items) {`;

const target7End = `        await dbRun(db, \`
          INSERT INTO CorporateActions (record_date, isin, symbol, action_type, numerator, denominator, dividend_per_share, source, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Upload', ?)
        \`, [row.record_date, isin, symbol, row.action_type, row.numerator, row.denominator, row.dividend_per_share, traceBatchId]);
        importedCount++;
      }
    }

    delete tempBatches[batch_id];`;

const repl7End = `        await dbRun(db, \`
          INSERT INTO CorporateActions (record_date, isin, symbol, action_type, numerator, denominator, dividend_per_share, source, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Upload', ?)
        \`, [row.record_date, isin, symbol, row.action_type, row.numerator, row.denominator, row.dividend_per_share, traceBatchId]);
        importedCount++;
      }
    }
      await dbRun(db, 'COMMIT');
    } catch (err) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw err;
    }

    delete tempBatches[batch_id];`;

content = safeReplace(content, target7, repl7, 'target7 (import items start)');
content = safeReplace(content, target7End, repl7End, 'target7End (import items end)');

// 8. Line 16350: /api/ledger/commit-staging
const target8 = `    let committedCount = 0;

    for (const row of items) {`;

const repl8 = `    let committedCount = 0;

    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      for (const row of items) {`;

const target8End = `        await dbRun(db, \`
          INSERT INTO CorporateActions (record_date, symbol, isin, action_type, numerator, denominator, source, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, 'Upload', ?)
        \`, [row.record_date || row.date, symbol, isin, row.action_type, num, den, batchId]);
        committedCount++;
      }
    }

    await runFIFO(db);`;

const repl8End = `        await dbRun(db, \`
          INSERT INTO CorporateActions (record_date, symbol, isin, action_type, numerator, denominator, source, batch_id)
          VALUES (?, ?, ?, ?, ?, ?, 'Upload', ?)
        \`, [row.record_date || row.date, symbol, isin, row.action_type, num, den, batchId]);
        committedCount++;
      }
    }
      await dbRun(db, 'COMMIT');
    } catch (err) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw err;
    }

    await runFIFO(db);`;

content = safeReplace(content, target8, repl8, 'target8 (commit-staging start)');
content = safeReplace(content, target8End, repl8End, 'target8End (commit-staging end)');

fs.writeFileSync(serverPath, content, 'utf8');
console.log('Finished updating server.ts. New size:', content.length);
