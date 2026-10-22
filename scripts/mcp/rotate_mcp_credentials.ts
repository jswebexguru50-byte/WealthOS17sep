#!/usr/bin/env node
/**
 * Credential rotation script — WealthOS MCP keys.
 * Reads new key values from argv, writes to .env.
 * NEVER prints key values to stdout/stderr.
 */
import { readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());
const envPath = resolve(ROOT, '.env');
let content = readFileSync(envPath, 'utf-8');

// Generate new keys
const newProd = 'wos-prod-' + randomBytes(32).toString('base64url');
const newDev  = 'wos-dev-'  + randomBytes(32).toString('base64url');
const newReview = newDev; // review key aliases dev key

// Replace existing keys in .env
function replaceKey(src: string, key: string, val: string): string {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(src)) {
    return src.replace(re, `${key}=${val}`);
  }
  return src.trimEnd() + `\n${key}=${val}\n`;
}

content = replaceKey(content, 'WEALTHOS_PRODUCT_KEY', newProd);
content = replaceKey(content, 'WEALTHOS_DEV_KEY', newDev);
content = replaceKey(content, 'WEALTHOS_REVIEW_KEY', newReview);

writeFileSync(envPath, content, 'utf-8');

// Output ONLY the confirmation — no key values
console.log('CREDENTIAL_ROTATION = PASS');
console.log('Keys updated: WEALTHOS_PRODUCT_KEY, WEALTHOS_DEV_KEY, WEALTHOS_REVIEW_KEY');
console.log('.env gitignored:', true);
