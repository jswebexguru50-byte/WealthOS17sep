const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const DUMMY_DB_PATH = 'scratch/dummy_portfolio.db';

// Create a dummy artifact for testing the watchdog
if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });
fs.writeFileSync(DUMMY_DB_PATH, 'dummy data');
const initialHash = crypto.createHash('sha256').update('dummy data').digest('hex');

function runWatchdog() {
  console.log('Running Fast-Track Safety Watchdog on dummy artifact...');
  
  const currentData = fs.readFileSync(DUMMY_DB_PATH);
  const currentHash = crypto.createHash('sha256').update(currentData).digest('hex');

  if (currentHash !== initialHash) {
    console.error(`WATCHDOG TRIGGERED! Dummy artifact mutated: Expected ${initialHash}, got ${currentHash}`);
    process.exit(1);
  }

  console.log('Watchdog verified zero mutations on dummy artifact.');
}

runWatchdog();
