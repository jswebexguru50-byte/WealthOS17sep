/**
 * scripts/inject_to_chatgpt.mjs
 * 
 * Injects the Master Handover Dossier + Context Dump XML directly into your active Opera ChatGPT tab.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const reviewsDir = path.resolve(rootDir, '.reviews');
const promptPath = path.resolve(reviewsDir, 'MASTER_HANDOVER_TO_REVIEWER_PROMPT.md');
const contextDumpPath = path.resolve(reviewsDir, 'context_dump.xml');

async function inject() {
  console.log('Connecting to Opera on port 9222...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 3000 });
  } catch (err) {
    console.error('Could not connect to Opera on port 9222. Please start Opera using scripts/start_opera_for_chatgpt.bat');
    process.exit(1);
  }

  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  let chatGptPage = pages.find(p => p.url().includes('chatgpt.com'));

  if (!chatGptPage) {
    console.log('No ChatGPT tab found. Opening https://chatgpt.com...');
    chatGptPage = await context.newPage();
    await chatGptPage.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
  }

  console.log('Waiting for ChatGPT input box...');
  const promptSelector = '#prompt-textarea, textarea[data-id], div[contenteditable="true"]';
  const promptEl = await chatGptPage.waitForSelector(promptSelector, { timeout: 30000 });

  // Attach context dump XML if it exists
  if (fs.existsSync(contextDumpPath)) {
    console.log(`Attaching ${contextDumpPath}...`);
    const fileInput = await chatGptPage.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(contextDumpPath);
      await chatGptPage.waitForTimeout(3000);
      console.log('✓ File attached.');
    }
  }

  // Read prompt
  const promptText = fs.readFileSync(promptPath, 'utf8');
  console.log(`Entering handover prompt (${promptText.length.toLocaleString()} characters)...`);

  await promptEl.click();
  await chatGptPage.evaluate(({ el, textToInsert }) => {
    if (el.tagName.toLowerCase() === 'textarea') {
      el.value = textToInsert;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, textToInsert);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { el: promptEl, textToInsert: promptText });

  await chatGptPage.waitForTimeout(1000);

  // Click Send
  const sendBtn = await chatGptPage.$('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]');
  if (sendBtn && await sendBtn.isEnabled()) {
    await sendBtn.click();
  } else {
    await chatGptPage.keyboard.press('Enter');
  }

  console.log('✓ Handover prompt sent to ChatGPT!');
}

inject().catch(err => console.error('Error:', err.message));
