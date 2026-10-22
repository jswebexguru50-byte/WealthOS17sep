/**
 * bedrock.ts — Express route exposing AWS Bedrock Claude Sonnet to the webapp.
 * All calls go directly to your AWS account. Zero Antigravity/Gemini bandwidth.
 *
 * Endpoints:
 *   POST /api/bedrock/ask          — single prompt → response
 *   POST /api/bedrock/chat         — multi-turn messages → response
 *   GET  /api/bedrock/usage        — current cost ledger + remaining balance
 *   GET  /api/bedrock/usage/hourly — hourly breakdown for today
 */

import { Router } from 'express';
import { BedrockService } from '../services/BedrockService.js';

const router = Router();
const bedrock = BedrockService.getInstance();

// ─── POST /api/bedrock/ask ──────────────────────────────────────────────────
// Simple single-prompt call to Claude Sonnet on your AWS Bedrock account.
// Body: { prompt: string, systemPrompt?: string, purposeTag?: string, maxTokens?: number }
router.post('/ask', async (req, res) => {
  try {
    const { prompt, systemPrompt, purposeTag, maxTokens } = req.body;
    if (!prompt?.trim()) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    const result = await bedrock.invoke(
      [{ role: 'user', content: prompt }],
      { systemPrompt, purposeTag, maxTokens }
    );

    res.json({
      success: true,
      data: {
        text: result.text,
        model: result.model,
        tokens: { input: result.inputTokens, output: result.outputTokens },
        cost: {
          thisCallUsd: result.costUsd,
          remainingBalanceUsd: result.remainingBalanceUsd,
        },
        timestamp: result.timestamp,
      },
    });
  } catch (err: any) {
    console.error('[Bedrock Route /ask]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/bedrock/chat ─────────────────────────────────────────────────
// Multi-turn conversation. Pass full message history each time.
// Body: { messages: [{role, content}], systemPrompt?: string, purposeTag?: string }
router.post('/chat', async (req, res) => {
  try {
    const { messages, systemPrompt, purposeTag, maxTokens } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const result = await bedrock.invoke(messages, { systemPrompt, purposeTag, maxTokens });

    res.json({
      success: true,
      data: {
        text: result.text,
        model: result.model,
        tokens: { input: result.inputTokens, output: result.outputTokens },
        cost: {
          thisCallUsd: result.costUsd,
          remainingBalanceUsd: result.remainingBalanceUsd,
        },
        timestamp: result.timestamp,
      },
    });
  } catch (err: any) {
    console.error('[Bedrock Route /chat]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/bedrock/usage ─────────────────────────────────────────────────
// Returns full cost ledger: total spent, remaining balance, per-call history.
router.get('/usage', (req, res) => {
  try {
    const summary = bedrock.getUsageSummary();
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/bedrock/usage/hourly ─────────────────────────────────────────
// Breaks today's calls into hourly buckets for cost dashboard.
router.get('/usage/hourly', (req, res) => {
  try {
    const summary = bedrock.getUsageSummary();
    const today = new Date().toISOString().slice(0, 10);

    // Bucket by hour
    const hourlyMap: Record<string, { calls: number; costUsd: number; tokens: number }> = {};
    for (let h = 0; h < 24; h++) {
      const key = `${today}T${String(h).padStart(2, '0')}`;
      hourlyMap[key] = { calls: 0, costUsd: 0, tokens: 0 };
    }

    summary.callHistory
      .filter(e => e.timestamp.startsWith(today))
      .forEach(e => {
        const hour = e.timestamp.slice(0, 13); // "2026-09-09T14"
        if (hourlyMap[hour]) {
          hourlyMap[hour].calls++;
          hourlyMap[hour].costUsd = +(hourlyMap[hour].costUsd + e.costUsd).toFixed(6);
          hourlyMap[hour].tokens += e.inputTokens + e.outputTokens;
        }
      });

    const hourlyArray = Object.entries(hourlyMap)
      .filter(([, v]) => v.calls > 0)
      .map(([hour, v]) => ({ hour, ...v }));

    res.json({
      success: true,
      data: {
        date: today,
        totalCallsToday: summary.totalCallsToday,
        totalCostTodayUsd: summary.totalCostTodayUsd,
        remainingBalanceUsd: summary.remainingBalanceUsd,
        hourly: hourlyArray,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
