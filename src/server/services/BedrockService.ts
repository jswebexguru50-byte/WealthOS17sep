/**
 * BedrockService.ts
 * Direct AWS Bedrock Claude Sonnet integration.
 * All calls go 100% to your AWS account — zero Antigravity/Gemini bandwidth consumed.
 *
 * Active model: us.anthropic.claude-sonnet-4-6 (confirmed working 2026-09-09)
 * Credentials: read from .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockCallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  remainingBalanceUsd: number;
  timestamp: string;
}

export interface BedrockUsageSummary {
  totalCallsToday: number;
  totalCostTodayUsd: number;
  totalCostAllTimeUsd: number;
  remainingBalanceUsd: number;
  lastCallAt: string | null;
  callHistory: BedrockLedgerEntry[];
}

interface BedrockLedgerEntry {
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cumulativeCostUsd: number;
  remainingBalanceUsd: number;
  purposeTag?: string;
}

interface BedrockLedger {
  initialCreditUsd: number;
  totalCostUsd: number;
  remainingBalanceUsd: number;
  history: BedrockLedgerEntry[];
}

// ─── Pricing (Claude Sonnet 4.6 on Bedrock, per 1M tokens) ──────────────────
const PRICING = {
  'us.anthropic.claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': { inputPer1M: 3.0, outputPer1M: 15.0 },
};
const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-6';
const INITIAL_CREDIT_USD = 100; // Your known starting credit

// ─── Ledger path ─────────────────────────────────────────────────────────────
// Works in both ESM (tsx/dev) and CJS (esbuild bundle)
const _bedrockDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(_bedrockDir, '../../bedrock_ledger.json');

// ─── BedrockService ──────────────────────────────────────────────────────────

export class BedrockService {
  private static instance: BedrockService;
  private _client: BedrockRuntimeClient | null = null;
  private ledger: BedrockLedger;

  private constructor() {
    this.ledger = this.loadLedger();
  }

  // Lazy init so dotenv has already populated process.env by first use
  private getClient(): BedrockRuntimeClient {
    if (!this._client) {
      // Attempt 1: process.env (set by dotenv or OS environment)
      // Treat empty string as missing — dotenv can set "" if the .env line is malformed
      let accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim() || undefined;
      let secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim() || undefined;
      let region = (process.env.AWS_REGION || '').trim() || 'us-east-1';

      // Attempt 2: Read .env file directly as reliable fallback
      if (!accessKeyId || !secretAccessKey) {
        try {
          // process.cwd() always points to project root when running via npm run dev
          const envPath = path.join(process.cwd(), '.env');
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            for (const line of envContent.split('\n')) {
              const eqIdx = line.indexOf('=');
              if (eqIdx === -1) continue;
              const k = line.slice(0, eqIdx).trim();
              const v = line.slice(eqIdx + 1).trim().replace(/\r$/, '');
              if (k === 'AWS_ACCESS_KEY_ID') accessKeyId = v;
              if (k === 'AWS_SECRET_ACCESS_KEY') secretAccessKey = v;
              if (k === 'AWS_REGION') region = v || region;
            }
            console.log(`[Bedrock] Loaded credentials from .env at: ${envPath}`);
          }
        } catch (e) {
          console.warn('[Bedrock] Could not read .env file directly:', e);
        }
      }

      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          `AWS credentials missing. Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env. ` +
          `Found: key=${accessKeyId ? 'YES' : 'NO'}, secret=${secretAccessKey ? 'YES' : 'NO'}`
        );
      }

      this._client = new BedrockRuntimeClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });

      console.log(`[Bedrock] Client initialized — region: ${region}, key: ${accessKeyId.slice(0, 8)}...`);
    }
    return this._client;
  }

  static getInstance(): BedrockService {
    if (!BedrockService.instance) {
      BedrockService.instance = new BedrockService();
    }
    return BedrockService.instance;
  }

  // ─── Core: Invoke Claude on Bedrock ────────────────────────────────────────

  async invoke(
    messages: BedrockMessage[],
    options: {
      systemPrompt?: string;
      maxTokens?: number;
      model?: string;
      purposeTag?: string;
    } = {}
  ): Promise<BedrockCallResult> {
    const model = options.model || DEFAULT_MODEL;
    const maxTokens = options.maxTokens || 4096;

    const payload: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages,
    };
    if (options.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    const command = new InvokeModelCommand({
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await this.getClient().send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));

    const inputTokens: number = body.usage?.input_tokens ?? 0;
    const outputTokens: number = body.usage?.output_tokens ?? 0;
    const text: string = body.content?.[0]?.text ?? '';

    const pricing = PRICING[model as keyof typeof PRICING] || PRICING[DEFAULT_MODEL];
    const costUsd = (inputTokens / 1_000_000) * pricing.inputPer1M +
                    (outputTokens / 1_000_000) * pricing.outputPer1M;

    // Update ledger
    this.ledger.totalCostUsd = +(this.ledger.totalCostUsd + costUsd).toFixed(6);
    this.ledger.remainingBalanceUsd = +(this.ledger.initialCreditUsd - this.ledger.totalCostUsd).toFixed(6);

    const entry: BedrockLedgerEntry = {
      timestamp: new Date().toISOString(),
      model,
      inputTokens,
      outputTokens,
      costUsd: +costUsd.toFixed(6),
      cumulativeCostUsd: this.ledger.totalCostUsd,
      remainingBalanceUsd: this.ledger.remainingBalanceUsd,
      purposeTag: options.purposeTag,
    };
    this.ledger.history.push(entry);
    this.saveLedger();

    console.log(
      `[Bedrock] ${model} | in:${inputTokens} out:${outputTokens} | $${costUsd.toFixed(5)} | balance: $${this.ledger.remainingBalanceUsd.toFixed(4)}`
    );

    return {
      text,
      model,
      inputTokens,
      outputTokens,
      costUsd: +costUsd.toFixed(6),
      remainingBalanceUsd: this.ledger.remainingBalanceUsd,
      timestamp: entry.timestamp,
    };
  }

  // ─── Convenience: Single user prompt ───────────────────────────────────────

  async ask(
    prompt: string,
    systemPrompt?: string,
    purposeTag?: string
  ): Promise<BedrockCallResult> {
    return this.invoke(
      [{ role: 'user', content: prompt }],
      { systemPrompt, purposeTag }
    );
  }

  // ─── Usage summary ─────────────────────────────────────────────────────────

  getUsageSummary(): BedrockUsageSummary {
    const today = new Date().toISOString().slice(0, 10);
    const todayEntries = this.ledger.history.filter(h => h.timestamp.startsWith(today));
    const totalCostTodayUsd = todayEntries.reduce((sum, h) => sum + h.costUsd, 0);
    const lastEntry = this.ledger.history[this.ledger.history.length - 1];

    return {
      totalCallsToday: todayEntries.length,
      totalCostTodayUsd: +totalCostTodayUsd.toFixed(6),
      totalCostAllTimeUsd: this.ledger.totalCostUsd,
      remainingBalanceUsd: this.ledger.remainingBalanceUsd,
      lastCallAt: lastEntry?.timestamp ?? null,
      callHistory: this.ledger.history.slice(-50), // last 50 calls
    };
  }

  // ─── Ledger persistence ─────────────────────────────────────────────────────

  private loadLedger(): BedrockLedger {
    try {
      if (fs.existsSync(LEDGER_PATH)) {
        return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf-8'));
      }
    } catch {
      // fallthrough to default
    }
    return {
      initialCreditUsd: INITIAL_CREDIT_USD,
      totalCostUsd: 0.123486, // amount already consumed in previous session
      remainingBalanceUsd: 99.876514,
      history: [],
    };
  }

  private saveLedger(): void {
    try {
      fs.writeFileSync(LEDGER_PATH, JSON.stringify(this.ledger, null, 2));
    } catch (e) {
      console.error('[Bedrock] Failed to save ledger:', e);
    }
  }
}
