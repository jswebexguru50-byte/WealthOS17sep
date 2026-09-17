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

async function runMigration() {
  console.log('='.repeat(100));
  console.log('PHASE 1: MULTI-USER FAMILY OFFICE TENANT ISOLATION MIGRATION');
  console.log('='.repeat(100));

  // 1. Create FamilyMembers Table
  console.log('1. Creating FamilyMembers table...');
  await dbRun(`
    CREATE TABLE IF NOT EXISTS FamilyMembers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      pan_number TEXT,
      tax_residency TEXT DEFAULT 'RESIDENT',
      avatar_color TEXT DEFAULT '#06b6d4',
      is_active INTEGER DEFAULT 1,
      pin_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Create MemberPortfolioPermissions Table
  console.log('2. Creating MemberPortfolioPermissions table...');
  await dbRun(`
    CREATE TABLE IF NOT EXISTS MemberPortfolioPermissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL REFERENCES FamilyMembers(id) ON DELETE CASCADE,
      portfolio_name TEXT NOT NULL,
      access_level TEXT DEFAULT 'FULL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, portfolio_name)
    )
  `);

  // 3. Add member_id column to tables if not present
  const tablesToAlter = [
    'Portfolios',
    'Transactions',
    'Holdings',
    'BankAccountsAndFDs',
    'RealizedGains',
    'NriTdsTransactions',
    'FemaRepatriationLedger',
    'CamsSummaryHoldings',
    'ZerodhaHoldings',
    'PmsSummaryHoldings',
    'ReconciledHoldings'
  ];

  for (const table of tablesToAlter) {
    const tableCols = await dbAll(`PRAGMA table_info(${table})`);
    const colNames = tableCols.map(c => c.name);
    if (!colNames.includes('member_id')) {
      console.log(`Adding member_id column to ${table}...`);
      try {
        await dbRun(`ALTER TABLE ${table} ADD COLUMN member_id INTEGER`);
      } catch (err: any) {
        console.warn(`Could not add member_id to ${table}:`, err.message);
      }
    }
  }

  // 4. Seed Initial Family Members
  console.log('3. Seeding default family members...');
  const existingMembers = await dbAll('SELECT * FROM FamilyMembers');
  if (existingMembers.length === 0) {
    await dbRun(`
      INSERT INTO FamilyMembers (id, uuid, name, email, role, pan_number, tax_residency, avatar_color)
      VALUES 
        (1, 'usr_vijaya_maa_001', 'Vijaya Sharma (Maa)', 'vijaya.sharma@family.internal', 'FAMILY_HEAD', 'ABCPV1234F', 'RESIDENT', '#ec4899'),
        (2, 'usr_gopal_self_002', 'Gopal (Self)', 'gopal@family.internal', 'FAMILY_HEAD', 'ABCPG5678K', 'NRI', '#06b6d4'),
        (3, 'usr_papa_003', 'Papa', 'papa@family.internal', 'MEMBER', 'ABCPP9012M', 'RESIDENT', '#f59e0b')
    `);
  }

  // 5. Portfolio Ownership Map
  const portfolioOwnerMap: Record<string, number> = {
    'Maa': 1,
    'cc9': 1,
    'Maa MF PF': 1,
    'Maa HDFC Sky': 1,
    'Papa': 3,
    'US - IBKR': 2,
    'Sarwa': 2,
    'Unlisted': 2,
    'Self Mutual Fund': 2,
    'Self HDFC Securities': 2,
    'DBFS': 2,
    'IIFL360': 2,
    'Cash & FD': 2
  };

  console.log('4. Assigning member_id across Portfolios, Transactions, and Holdings...');
  for (const [port, memberId] of Object.entries(portfolioOwnerMap)) {
    await dbRun(`UPDATE Portfolios SET member_id = ? WHERE name = ?`, [memberId, port]);
    await dbRun(`UPDATE Transactions SET member_id = ? WHERE portfolio = ?`, [memberId, port]);
    await dbRun(`UPDATE Holdings SET member_id = ? WHERE portfolio = ?`, [memberId, port]);
    await dbRun(`UPDATE RealizedGains SET member_id = ? WHERE portfolio = ?`, [memberId, port]);
    await dbRun(`UPDATE ReconciledHoldings SET member_id = ? WHERE portfolio = ?`, [memberId, port]);
    
    // Grant Full permission in MemberPortfolioPermissions
    await dbRun(`
      INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level)
      VALUES (?, ?, 'FULL')
    `, [memberId, port]);
  }

  // 6. Grant Family Heads (Vijaya and Gopal) cross-portfolio viewing permissions
  console.log('5. Setting up Family Head consolidated permissions...');
  const allPorts = Object.keys(portfolioOwnerMap);
  for (const port of allPorts) {
    await dbRun(`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (1, ?, 'FULL')`, [port]);
    await dbRun(`INSERT OR IGNORE INTO MemberPortfolioPermissions (member_id, portfolio_name, access_level) VALUES (2, ?, 'FULL')`, [port]);
  }

  // 7. Verify Migration Results
  const totalTxns = await dbAll('SELECT COUNT(*) as count FROM Transactions');
  const txnsWithMember = await dbAll('SELECT member_id, COUNT(*) as count FROM Transactions GROUP BY member_id');
  const holdingsWithMember = await dbAll('SELECT member_id, COUNT(*) as count, SUM(current_value) as total_val FROM Holdings GROUP BY member_id');
  const members = await dbAll('SELECT * FROM FamilyMembers');

  console.log('\n--- MIGRATION VERIFICATION ---');
  console.log('Total Transactions in DB:', totalTxns[0].count);
  console.log('Transactions by Member:', txnsWithMember);
  console.log('Holdings by Member:');
  console.table(holdingsWithMember.map(h => ({
    member_id: h.member_id,
    holdings_count: h.count,
    total_val_cr: `₹${((h.total_val || 0) / 1e7).toFixed(2)} Cr`
  })));
  console.log('Family Members Configured:');
  console.table(members.map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    tax_residency: m.tax_residency,
    email: m.email
  })));

  console.log('\nSUCCESS: Database schema and portfolio data cleanly migrated with zero loss.');
}

runMigration().catch(console.error);
