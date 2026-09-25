/**
 * Master Deterministic Pipeline for Six Strategies (S1A, S1B, S2A, S3A, S4A, S5A)
 * Runs 90-session recursive scan and generates the 7-tab professional Excel report.
 * Zero LLM calls in this pipeline.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (key, fallback) => {
  const idx = args.indexOf(key);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const asOfDate = getArg('--as-of-date', '2026-09-24');
const signalStartDate = getArg('--signal-start-date', '2026-05-18');
const dateStamp = asOfDate.replaceAll('-', '');
const universeName = `full_universe_90_${dateStamp}`;

function runCommand(command, cmdArgs) {
  return new Promise((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`[RUNNING] ${command} ${cmdArgs.join(' ')}`);
    console.log(`======================================================`);
    const child = spawn(command, cmdArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true
    });
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
    child.on('error', err => reject(err));
  });
}

async function main() {
  const startTime = Date.now();
  console.log(`Starting 90-Session Deterministic Quant Pipeline`);
  console.log(`Cutoff Date: ${asOfDate} | Signal Start Date: ${signalStartDate}`);

  // Step 1: Run S1A (Volume Price Alignment 3-Leg Reclaim)
  console.log('\n>>> Step 1/7: Scanning S1A (VPA 3-Leg Reclaim)...');
  await runCommand('python', [
    'scripts/market_data/vpa_three_leg_screen.py',
    '--all-local-symbols',
    '--as-of-date', asOfDate,
    '--historical-bars', '90',
    '--universe-name', universeName
  ]);

  // Step 2: Run S1B (VPA Trough Reversal)
  console.log('\n>>> Step 2/7: Scanning S1B (VPA Trough Reversal)...');
  await runCommand('python', [
    'scripts/market_data/vpa_s1b_screen.py',
    '--as-of-date', asOfDate,
    '--historical-bars', '90',
    '--universe-name', universeName
  ]);

  // Step 3: Run S2A (Institutional FVG and Consequent Encroachment)
  console.log('\n>>> Step 3/7: Scanning S2A (Institutional FVG and CE)...');
  await runCommand('python', [
    'scripts/market_data/s2a_institutional_fvg_ce.py',
    '--all-local-symbols',
    '--as-of-date', asOfDate,
    '--historical-bars', '90',
    '--universe-name', universeName
  ]);

  // Step 4: Run S3A (HH/HL ATR Compression)
  console.log('\n>>> Step 4/7: Scanning S3A (HH/HL ATR Compression)...');
  await runCommand('node', [
    'scripts/market_data/scan_s3a_90d.mjs',
    '--as-of-date', asOfDate
  ]);

  // Step 5: Run S4A (Gap Running Breakouts)
  console.log('\n>>> Step 5/7: Scanning S4A (Gap Running Breakouts)...');
  await runCommand('node', [
    'scripts/market_data/scan_s4a_90d.mjs',
    '--as-of-date', asOfDate,
    '--signal-start-date', signalStartDate
  ]);

  // Step 6: Run S5A (Minervini Winning Stocks)
  console.log('\n>>> Step 6/7: Scanning S5A (Minervini Winning Stocks)...');
  await runCommand('node', [
    'scripts/market_data/scan_s5a_90d.mjs',
    '--as-of-date', asOfDate,
    '--signal-start-date', signalStartDate
  ]);

  // Step 7: Build the Master 7-Tab Professional Excel Report
  console.log('\n>>> Step 7/7: Compiling 7-Tab Master Excel Workbook...');
  await runCommand('node', [
    'scripts/market_data/build_seven_strategy_90d_excel.mjs',
    '--cutoff', asOfDate,
    '--period-start', signalStartDate
  ]);

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`All 6 Strategies Scanned and 7-Tab Excel Generated!`);
  console.log(`Total Pipeline Execution Time: ${elapsedMin} minutes`);
  console.log(`Output: outputs/Six_Strategies_90_Sessions_${asOfDate}.xlsx`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
