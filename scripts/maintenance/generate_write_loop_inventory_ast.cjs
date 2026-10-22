const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.resolve(__dirname, '../../');

function getAllServerFiles() {
  const files = [path.join(rootDir, 'server.ts')];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!['node_modules', 'dist', '.git', 'reports', 'scratch'].includes(ent.name)) {
          walk(full);
        }
      } else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts') && !ent.name.includes('.test.')) {
        files.push(full);
      }
    }
  }
  const srvDir = path.join(rootDir, 'src/server');
  if (fs.existsSync(srvDir)) walk(srvDir);
  return files;
}

const candidateFiles = getAllServerFiles();
console.log(`Analyzing AST across ${candidateFiles.length} server files...`);

const inventory = [];

for (const filePath of candidateFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  // Helper to get line number (1-based)
  function getLine(pos) {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  // Check if a call expression is a DB write
  function isDbWriteCall(node) {
    // 1. dbRun(...)
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'dbRun') {
        return { isWrite: true, type: 'dbRun', node };
      }
      // db.run(...) or database.run(...)
      if (ts.isPropertyAccessExpression(expr)) {
        const obj = expr.expression;
        const prop = expr.name;
        if (ts.isIdentifier(prop) && (prop.text === 'run' || prop.text === 'exec')) {
          if (ts.isIdentifier(obj) && /^(db|database|sqlite|rawDb)$/i.test(obj.text)) {
            return { isWrite: true, type: 'db.run', node };
          }
          // db.prepare(...).run(...)
          if (ts.isCallExpression(obj) && ts.isPropertyAccessExpression(obj.expression)) {
            const innerProp = obj.expression.name;
            if (ts.isIdentifier(innerProp) && innerProp.text === 'prepare') {
              return { isWrite: true, type: 'prepare.run', node: obj };
            }
          }
        }
      }
    }
    return { isWrite: false };
  }

  // Extract SQL string if literal
  function extractSqlAndTable(callNode) {
    let sqlText = '';
    // Check arguments
    for (const arg of callNode.arguments) {
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        sqlText = arg.text;
        break;
      } else if (ts.isTemplateExpression(arg)) {
        sqlText = arg.getText(sourceFile);
        break;
      }
    }
    const match = sqlText.match(/(INSERT(?:\s+OR\s+IGNORE|\s+OR\s+REPLACE)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+([A-Za-z0-9_]+)/i);
    let op = 'UNKNOWN';
    let table = 'UNKNOWN';
    if (match) {
      op = match[1].toUpperCase().replace(/\s+/g, ' ');
      table = match[2];
    } else {
      if (/INSERT/i.test(sqlText)) op = 'INSERT';
      else if (/UPDATE/i.test(sqlText)) op = 'UPDATE';
      else if (/DELETE/i.test(sqlText)) op = 'DELETE';
    }
    return { op, table, sqlText: sqlText.slice(0, 100).replace(/\s+/g, ' ') };
  }

  // Traverse AST to find loops containing DB writes
  function checkLoopBody(loopNode, loopType) {
    const loopWrites = [];
    let hasAsyncNetwork = false;

    function findWrites(n) {
      // Check for network I/O
      if (ts.isCallExpression(n)) {
        const text = n.expression.getText(sourceFile);
        if (/fetch|axios|https?\.get|https?\.request/i.test(text)) {
          hasAsyncNetwork = true;
        }
      }

      const writeCheck = isDbWriteCall(n);
      if (writeCheck.isWrite) {
        loopWrites.push({
          callNode: n,
          type: writeCheck.type,
          info: extractSqlAndTable(n)
        });
      }
      ts.forEachChild(n, findWrites);
    }

    findWrites(loopNode);

    if (loopWrites.length > 0) {
      // Check if enclosed in withTx, runInDbLock, or if enclosing function has transaction
      let isEnclosedInWithTx = false;
      let curr = loopNode.parent;
      while (curr) {
        if (ts.isCallExpression(curr)) {
          const fnName = curr.expression.getText(sourceFile);
          if (fnName === 'withTx' || fnName.endsWith('.withTx') || fnName === 'runInDbLock' || fnName.endsWith('.transaction')) {
            isEnclosedInWithTx = true;
            break;
          }
        }
        if (ts.isFunctionLike(curr)) {
          const fnText = curr.getText(sourceFile);
          if (/BEGIN\s+(?:IMMEDIATE|TRANSACTION)|withTx\s*\(|runInDbLock\s*\(/i.test(fnText)) {
            isEnclosedInWithTx = true;
            break;
          }
        }
        curr = curr.parent;
      }

      // Check if function or block has BEGIN IMMEDIATE or BEGIN TRANSACTION before loop
      let hasBeginTxBefore = false;
      const loopLine = getLine(loopNode.getStart(sourceFile));
      const codeBeforeLoop = sourceCode.slice(Math.max(0, loopNode.getStart(sourceFile) - 4000), loopNode.getStart(sourceFile));
      if (/BEGIN\s+(?:IMMEDIATE|TRANSACTION)/i.test(codeBeforeLoop)) {
        hasBeginTxBefore = true;
      }

      const isProtected = isEnclosedInWithTx || hasBeginTxBefore;
      const safeToBatch = !hasAsyncNetwork;

      const tables = Array.from(new Set(loopWrites.map(w => w.info.table).filter(t => t !== 'UNKNOWN')));
      const opTypes = Array.from(new Set(loopWrites.map(w => w.info.op)));

      let status = 'TRANSACTION_PROTECTED';
      if (!isProtected) {
        status = safeToBatch ? 'NEEDS_REMEDIATION' : 'UNSAFE_DUE_TO_ASYNC_IO';
      }

      inventory.push({
        file: relPath,
        line: loopLine,
        loopType,
        writeCallsCount: loopWrites.length,
        operationType: opTypes.join(', ') || 'DB_WRITE',
        tablesAffected: tables.length > 0 ? tables : ['UNKNOWN'],
        transactionProtected: isProtected,
        safeToBatch,
        batchSize: 1000,
        needsRemediation: status === 'NEEDS_REMEDIATION',
        containsAsyncIO: hasAsyncNetwork,
        status,
        details: loopWrites[0]?.info.sqlText || ''
      });
    }
  }

  function visit(node) {
    if (ts.isForStatement(node)) {
      checkLoopBody(node.statement, 'for');
    } else if (ts.isForOfStatement(node)) {
      checkLoopBody(node.statement, 'for...of');
    } else if (ts.isForInStatement(node)) {
      checkLoopBody(node.statement, 'for...in');
    } else if (ts.isWhileStatement(node)) {
      checkLoopBody(node.statement, 'while');
    } else if (ts.isDoStatement(node)) {
      checkLoopBody(node.statement, 'do...while');
    } else if (ts.isCallExpression(node)) {
      // Check for .forEach or .map with async callback containing writes
      if (ts.isPropertyAccessExpression(node.expression)) {
        const prop = node.expression.name.text;
        if ((prop === 'forEach' || prop === 'map') && node.arguments.length > 0) {
          const cb = node.arguments[0];
          if (ts.isFunctionExpression(cb) || ts.isArrowFunction(cb)) {
            checkLoopBody(cb.body, `.${prop}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

console.log(`\nAST Scan Complete: Found ${inventory.length} total write loop sites.`);

const protectedCount = inventory.filter(x => x.transactionProtected).length;
const needsRemediation = inventory.filter(x => x.status === 'NEEDS_REMEDIATION').length;
const unsafeCount = inventory.filter(x => x.status === 'UNSAFE_DUE_TO_ASYNC_IO').length;

console.log(`Status breakdown:
  - Transaction Protected: ${protectedCount}
  - Needs Remediation: ${needsRemediation}
  - Unsafe due to Async I/O: ${unsafeCount}
`);

const outPath = path.join(rootDir, 'scripts/maintenance/review_write_loop_inventory.json');
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2));
console.log(`Written inventory to ${outPath}`);
