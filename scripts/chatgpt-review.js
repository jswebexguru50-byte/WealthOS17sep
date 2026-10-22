/**
 * scripts/chatgpt-review.js
 *
 * AUTOMATED CHATGPT CODE & DATA CONTEXT INGESTION VIA OPERA & PLAYWRIGHT (METHOD 1)
 *
 * Automates the entire workflow:
 * 1. Exports database schema + sample records (.reviews/schema_and_sample.sql / .json).
 * 2. Bundles code + data schemas into .reviews/context_dump.xml using repomix.
 * 3. Launches or connects to your Opera Explorer session.
 * 4. Navigates to ChatGPT, waits for your login (if not already logged in), and injects the context payload.
 * 5. Sends prompt, monitors completion, and saves the full review output to .reviews/chatgpt_review_latest.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const reviewsDir = path.resolve(rootDir, '.reviews');
const profileDir = path.resolve(reviewsDir, 'opera_chatgpt_profile');

if (!fs.existsSync(reviewsDir)) {
  fs.mkdirSync(reviewsDir, { recursive: true });
}

// Locate Opera Executable on Windows
function findOperaExecutable() {
  const possiblePaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera GX', 'opera.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Opera', 'opera.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Opera', 'opera.exe'),
    'C:\\Program Files\\Opera\\opera.exe',
    'C:\\Program Files (x86)\\Opera\\opera.exe'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Parse Command Line Arguments
const args = process.argv.slice(2);
const isFocused = args.includes('--focused') || args.includes('--fast');
const forceAttach = args.includes('--attach') || args.includes('--file');
const forcePaste = args.includes('--paste');
const closeOnFinish = args.includes('--close');

let customPrompt = null;
const promptIndex = args.indexOf('--prompt');
if (promptIndex !== -1 && args[promptIndex + 1]) {
  customPrompt = args[promptIndex + 1];
}
const promptFileIndex = args.indexOf('--prompt-file');
if (promptFileIndex !== -1 && args[promptFileIndex + 1]) {
  const pPath = path.resolve(rootDir, args[promptFileIndex + 1]);
  if (fs.existsSync(pPath)) {
    customPrompt = fs.readFileSync(pPath, 'utf8');
    console.log(`Loaded custom prompt from file: ${pPath} (${customPrompt.length.toLocaleString()} characters)`);
  } else {
    console.warn(`Warning: Prompt file not found at ${pPath}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('   CHATGPT AUTOMATED CODE & DATA INGESTION ENGINE (METHOD 1)    ');
  console.log('   Playwright + Opera Explorer Automation for Free ChatGPT      ');
  console.log('================================================================\n');

  // STEP 1: EXPORT DATA SCHEMAS & SAMPLES
  console.log('[Step 1/5] Exporting SQLite database schema and sample records...');
  const exportScript = path.resolve(rootDir, 'scripts/export_schema_and_sample.mjs');
  if (fs.existsSync(exportScript)) {
    execSync(`node "${exportScript}"`, { stdio: 'inherit' });
  } else {
    console.warn('Warning: export_schema_and_sample.mjs not found, skipping direct export.');
  }

  // STEP 2: RUN REPOMIX TO BUNDLE CODE + DATA
  console.log('\n[Step 2/5] Packaging code and data schemas using repomix...');
  const configFile = isFocused ? 'repomix.focused.config.json' : 'repomix.config.json';
  console.log(`Using repomix config: ${configFile}`);
  execSync(`npx repomix --config ${configFile} --style xml`, { stdio: 'inherit' });

  const contextDumpPath = path.resolve(reviewsDir, 'context_dump.xml');
  if (!fs.existsSync(contextDumpPath)) {
    throw new Error(`Context bundle was not generated at ${contextDumpPath}`);
  }

  const fileStats = fs.statSync(contextDumpPath);
  const fileSizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  const contextPayload = fs.readFileSync(contextDumpPath, 'utf8');
  console.log(`✓ Context bundle generated: ${contextDumpPath} (${fileSizeMb} MB, ${contextPayload.length.toLocaleString()} characters)`);

  // STEP 3: INITIALIZE OPERA VIA PLAYWRIGHT
  console.log('\n[Step 3/5] Initializing Opera Explorer session...');
  const operaPath = findOperaExecutable();
  if (!operaPath) {
    throw new Error('Could not locate Opera installation on your system. Please verify Opera is installed.');
  }
  console.log(`Found Opera executable: ${operaPath}`);

  let browserContext = null;
  let page = null;

  // Check if Opera is already running on remote debugging port 9222
  try {
    console.log('Checking for active Opera session on port 9222 (CDP)...');
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 2000 });
    const contexts = browser.contexts();
    browserContext = contexts[0] || await browser.newContext();
    const pages = browserContext.pages();
    page = pages[0] || await browserContext.newPage();
    console.log('✓ Successfully connected to existing running Opera session on port 9222!');
  } catch (e) {
    console.log('No existing debugging session found on port 9222. Launching Opera with persistent profile...');
    browserContext = await chromium.launchPersistentContext(profileDir, {
      executablePath: operaPath,
      headless: false,
      viewport: null, // Open maximized / standard window
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ]
    });
    page = browserContext.pages()[0] || await browserContext.newPage();
  }

  // STEP 4: NAVIGATE TO CHATGPT & DETECT ACTIVE SESSION
  console.log('\n[Step 4/5] Navigating to ChatGPT (https://chatgpt.com)...');
  await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Checking ChatGPT login status...');
  const promptSelector = '#prompt-textarea, textarea[data-id], div[contenteditable="true"]';

  let loggedIn = false;
  try {
    await page.waitForSelector(promptSelector, { timeout: 5000 });
    loggedIn = true;
    console.log('✓ Already logged into ChatGPT! Active chat session detected.');
  } catch (err) {
    console.log('\n================================================================');
    console.log(' 👉 PLEASE LOG IN TO CHATGPT IN THE OPENED OPERA EXPLORER WINDOW ');
    console.log('    Take your time to complete login, 2FA, or verification.      ');
    console.log('    Waiting for active chat input box (timeout: 10 minutes)...   ');
    console.log('================================================================\n');

    const maxWaitSeconds = 600; // 10 minutes
    const startTime = Date.now();
    let secondsElapsed = 0;

    while (!loggedIn && secondsElapsed < maxWaitSeconds) {
      await page.waitForTimeout(2000);
      secondsElapsed = Math.floor((Date.now() - startTime) / 1000);

      // Check active page and any other open tabs (e.g. if OAuth redirected or opened new tab)
      const pages = browserContext.pages();
      for (const p of pages) {
        try {
          const el = await p.$(promptSelector);
          if (el && await el.isVisible()) {
            loggedIn = true;
            page = p; // Switch to the active chat tab
            break;
          }
        } catch (checkErr) {
          // Tab might be navigating, ignore
        }
      }

      if (secondsElapsed % 30 === 0 && !loggedIn) {
        const remaining = maxWaitSeconds - secondsElapsed;
        console.log(`Still waiting for login (${remaining}s remaining)... Please log into ChatGPT in Opera.`);
      }
    }

    if (!loggedIn) {
      throw new Error('Login timed out after 10 minutes. Please run the script again whenever you are ready to log into ChatGPT.');
    }
    console.log('✓ Login detected! ChatGPT session is now active.');
  }

  // Allow interface to settle
  await page.waitForTimeout(2000);

  // STEP 5: PREPARE AND SUBMIT CONTEXT TO CHATGPT
  console.log('\n[Step 5/5] Injecting code and schema context bundle into ChatGPT...');

  const defaultPromptText = `Review my code alongside the included database schema and sample data. Ensure all queries, field mappings, and logic handle edge cases correctly.`;
  const instructionPrompt = customPrompt || defaultPromptText;

  // Decision: Attach file vs Paste text
  // If payload is over 35k characters or forceAttach is set, attach the XML file directly
  const shouldAttach = forceAttach || (!forcePaste && contextPayload.length > 35000);

  if (shouldAttach) {
    console.log(`Payload size is ${contextPayload.length.toLocaleString()} chars. Uploading ${contextDumpPath} as file attachment...`);

    // Look for file input
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(contextDumpPath);
      console.log('✓ File attached to ChatGPT session. Waiting for file upload preview...');
      await page.waitForTimeout(3000);
    } else {
      console.warn('File input not found directly. Attempting to click attachment button...');
      const attachBtn = await page.$('button[aria-label*="Attach"], button[aria-label*="Upload"], button[data-testid*="attach"]');
      if (attachBtn) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          attachBtn.click()
        ]);
        await fileChooser.setFiles(contextDumpPath);
        console.log('✓ File attached via file chooser.');
        await page.waitForTimeout(3000);
      } else {
        console.warn('Could not locate file attachment button; falling back to direct prompt entry.');
      }
    }

    // Set text prompt
    const finalPrompt = `${instructionPrompt}\n\n(See attached context_dump.xml containing full repository code, SQLite DDL schemas, and sample records)`;
    await enterPromptText(page, finalPrompt);
  } else {
    console.log(`Pasting prompt and context payload directly into textarea (${contextPayload.length.toLocaleString()} characters)...`);
    const fullPrompt = `${instructionPrompt}\n\n${contextPayload}`;
    await enterPromptText(page, fullPrompt);
  }

  // Submit Prompt
  console.log('Sending review request to ChatGPT...');
  await submitPrompt(page);
  console.log('✓ Review request successfully sent! Waiting for ChatGPT to generate review...');

  // STEP 6: MONITOR STREAMING AND EXTRACT FULL RESPONSE
  const responseMarkdown = await waitForResponseCompletion(page);

  // STEP 7: SAVE REVIEW TO ARTIFACT
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const latestOutputFile = path.resolve(reviewsDir, 'chatgpt_review_latest.md');
  const timestampedOutputFile = path.resolve(reviewsDir, `chatgpt_review_${timestamp}.md`);

  const reviewDocument = `# ChatGPT Code & Data Architecture Review
**Date:** ${new Date().toISOString()}  
**Context Bundle:** \`.reviews/context_dump.xml\` (${fileSizeMb} MB)  
**Database Schema:** \`.reviews/schema_and_sample.sql\`  
**Automation Runner:** \`scripts/chatgpt-review.js\` (Method 1: Playwright + Opera)  

---

${responseMarkdown}
`;

  fs.writeFileSync(latestOutputFile, reviewDocument, 'utf8');
  fs.writeFileSync(timestampedOutputFile, reviewDocument, 'utf8');

  console.log('\n================================================================');
  console.log('   🎉 REVIEW COMPLETED & SAVED SUCCESSFULLY!                    ');
  console.log(`   Latest Output:       ${latestOutputFile}`);
  console.log(`   Timestamped Output:  ${timestampedOutputFile}`);
  console.log(`   Response Length:     ${responseMarkdown.length.toLocaleString()} characters`);
  console.log('================================================================\n');

  if (closeOnFinish) {
    console.log('Closing Opera browser as requested by --close flag.');
    await browserContext.close();
  } else {
    console.log('Browser session left open in Opera so you can review and continue chatting.');
  }
}

// Helper: Enter text into ChatGPT prompt
async function enterPromptText(page, text) {
  const promptEl = await page.waitForSelector('#prompt-textarea, textarea[data-id], div[contenteditable="true"]');
  await promptEl.click();
  await page.waitForTimeout(300);

  // For fast and reliable entry of large text in contenteditable / textarea
  await page.evaluate(({ el, textToInsert }) => {
    if (el.tagName.toLowerCase() === 'textarea') {
      el.value = textToInsert;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Contenteditable div
      el.focus();
      // Use execCommand or textContent
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, textToInsert);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { el: promptEl, textToInsert: text });

  await page.waitForTimeout(500);
}

// Helper: Click Send or Press Enter
async function submitPrompt(page) {
  const sendButtonSelector = 'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]';
  let sendBtn = await page.$(sendButtonSelector);

  // Wait for button to become enabled (e.g. while file attachment is processing)
  let waited = 0;
  while (sendBtn && !(await sendBtn.isEnabled()) && waited < 20) {
    await page.waitForTimeout(1000);
    waited++;
    sendBtn = await page.$(sendButtonSelector);
  }

  if (sendBtn && await sendBtn.isEnabled()) {
    await sendBtn.click();
  } else {
    // Fallback to pressing Enter
    await page.keyboard.press('Enter');
  }
}

// Helper: Monitor completion and extract markdown
async function waitForResponseCompletion(page) {
  console.log('Monitoring response stream...');
  
  // Wait for response generation to begin
  const stopButtonSelector = 'button[data-testid="stop-button"], button[aria-label="Stop generating"]';
  try {
    await page.waitForSelector(stopButtonSelector, { timeout: 15000 });
    console.log(' -> Generation in progress...');
  } catch (e) {
    // Sometimes response starts and finishes quickly
  }

  // Wait until stop button disappears (meaning generation is finished)
  let generating = true;
  let iterations = 0;
  while (generating && iterations < 180) { // Max 6 minutes wait
    await page.waitForTimeout(2000);
    iterations++;
    const stopBtn = await page.$(stopButtonSelector);
    if (!stopBtn || !(await stopBtn.isVisible())) {
      generating = false;
    } else {
      if (iterations % 5 === 0) {
        process.stdout.write('.');
      }
    }
  }
  console.log('\n✓ Generation completed.');

  // Wait 2 extra seconds for final DOM rendering
  await page.waitForTimeout(2000);

  // Extract the latest assistant message
  const assistantMessages = await page.$$('div[data-message-author-role="assistant"], article[data-testid*="conversation-turn"]');
  if (assistantMessages.length === 0) {
    // Fallback selector
    const fallbackText = await page.evaluate(() => {
      const turns = document.querySelectorAll('.agent-turn, .markdown');
      if (turns.length > 0) return turns[turns.length - 1].innerText;
      return 'Could not automatically extract response text from DOM.';
    });
    return fallbackText;
  }

  const lastMessage = assistantMessages[assistantMessages.length - 1];
  const markdownText = await lastMessage.evaluate(el => el.innerText);
  return markdownText;
}

main().catch(err => {
  console.error('\n❌ Execution Error:', err.message);
  process.exit(1);
});
