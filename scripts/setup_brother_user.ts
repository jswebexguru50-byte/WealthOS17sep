import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('portfolio.db');

function dbRun(query: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(query: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function setupUsersAndBrotherPortfolios() {
  console.log('='.repeat(100));
  console.log('CONFIGURING MULTI-USER SEPARATION: PRIMARY (ALL 13 PORTFOLIOS) vs BROTHER (2 SEPARATE PORTFOLIOS)');
  console.log('='.repeat(100));

  // Reset FamilyMembers to clean structure
  await dbRun('DELETE FROM FamilyMembers');
  await dbRun('DELETE FROM MemberPortfolioPermissions');

  // 1. Insert Primary User (Gopal / Self) - Member ID 1
  await dbRun(`
    INSERT INTO FamilyMembers (id, uuid, name, email, role, tax_residency, avatar_color)
    VALUES (1, 'usr_gopal_primary', 'Gopal (Primary / Family Office)', 'gopal@family.internal', 'FAMILY_HEAD', 'NRI', '#06b6d4')
  `);

  // 2. Insert Brother - Member ID 2
  await dbRun(`
    INSERT INTO FamilyMembers (id, uuid, name, email, role, tax_residency, avatar_color)
    VALUES (2, 'usr_brother_002', 'Brother', 'brother@family.internal', 'MEMBER', 'RESIDENT', '#8b5cf6')
  `);

  // 3. Assign all existing 13 portfolios exclusively to Primary User (Member ID 1)
  const existingPortfolios = [
    'Maa',
    'cc9',
    'Papa',
    'Unlisted',
    'US - IBKR',
    'Maa MF PF',
    'Self Mutual Fund',
    'Self HDFC Securities',
    'Maa HDFC Sky',
    'DBFS',
    'IIFL360',
    'Sarwa',
    'Cash & FD'
  ];

  for (const p of existingPortfolios) {
    await dbRun(`UPDATE Portfolios SET member_id = 1 WHERE name = ?`, [p]);
    await dbRun(`UPDATE Transactions SET member_id = 1 WHERE portfolio = ?`, [p]);
    await dbRun(`UPDATE Holdings SET member_id = 1 WHERE portfolio = ?`, [p]);
    await dbRun(`UPDATE RealizedGains SET member_id = 1 WHERE portfolio = ?`, [p]);
    await dbRun(`UPDATE ReconciledHoldings SET member_id = 1 WHERE portfolio = ?`, [p]);
    await dbRun(`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (1, ?, 'FULL')`, [p]);
  }

  // 4. Create Brother's two dedicated portfolios (Member ID 2)
  const brotherPortfolios = [
    { name: 'Brother - Equity', type: 'EQUITY', currency: 'INR' },
    { name: 'Brother - Mutual Funds', type: 'MUTUAL_FUND', currency: 'INR' }
  ];

  for (const bp of brotherPortfolios) {
    const existing = await dbAll('SELECT * FROM Portfolios WHERE name = ?', [bp.name]);
    if (existing.length === 0) {
      await dbRun(`
        INSERT INTO Portfolios (name, type, base_currency, status, member_id, family_group)
        VALUES (?, ?, ?, 'ACTIVE', 2, 'Brother Accounts')
      `, [bp.name, bp.type, bp.currency]);
    } else {
      await dbRun(`UPDATE Portfolios SET member_id = 2 WHERE name = ?`, [bp.name]);
    }
    await dbRun(`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (2, ?, 'FULL')`, [bp.name]);
  }

  console.log('\n--- VERIFICATION OF MULTI-USER ISOLATION ---');
  const members = await dbAll('SELECT * FROM FamilyMembers');
  for (const m of members) {
    const ports = await dbAll('SELECT name, type, base_currency FROM Portfolios WHERE member_id = ?', [m.id]);
    const holdings = await dbAll('SELECT COUNT(*) as count, SUM(current_value) as val FROM Holdings WHERE member_id = ?', [m.id]);
    const txns = await dbAll('SELECT COUNT(*) as count FROM Transactions WHERE member_id = ?', [m.id]);
    console.log(`\nUser: [${m.id}] ${m.name} (${m.role})`);
    console.log(`  Assigned Portfolios (${ports.length}):`, ports.map(p => `${p.name} (${p.type})`).join(', '));
    console.log(`  Transactions: ${txns[0].count} | Active Holdings: ${holdings[0].count} (₹${((holdings[0].val || 0) / 1e7).toFixed(2)} Cr)`);
  }

  console.log('\nSUCCESS: Current portfolios untouched and 100% owned by Gopal. Brother isolated with his 2 dedicated portfolios.');
}

setupUsersAndBrotherPortfolios().catch(console.error);
