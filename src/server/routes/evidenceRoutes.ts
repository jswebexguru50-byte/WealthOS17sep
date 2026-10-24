/**
 * src/server/routes/evidenceRoutes.ts
 * 29Q route with evidence envelope support
 */

import { Router } from 'express';
import { EvidenceEnvelopeService } from '../services/EvidenceEnvelopeService.js';
import { EvidenceProvider } from '../services/EvidenceProvider.js';
import { ConfidenceCalculator } from '../services/ConfidenceCalculator.js';
import { TimestampService } from '../services/TimestampService.js';
import { CacheService } from '../services/CacheService.js';

const router = Router();
const evidenceService = EvidenceEnvelopeService.getInstance();
const providerService = EvidenceProvider.getInstance();
const confidenceCalc = ConfidenceCalculator.getInstance();
const timestampService = TimestampService.getInstance();
const cacheService = CacheService.getInstance();

// GET /api/29q - Return portfolio data with evidence envelope
router.get('/', async (req, res) => {
  try {
    const { portfolio, date } = req.query;

    if (!portfolio) {
      return res.status(400).json({
        evidence: {
          urls: [],
          timestamp: timestampService.getCurrentTimestamp(),
          confidence: 0,
          sources: [],
          error_source: 'Missing portfolio parameter'
        }
      });
    }

    // Mock portfolio data
    const portfolioData = {
      portfolio: String(portfolio),
      date: date ? String(date) : new Date().toISOString().split('T')[0],
      holdings: [],
      totalValue: 0
    };

    // Generate evidence envelope
    const cacheKey = `portfolio:${portfolio}:${portfolioData.date}`;
    let cachedEvidence = cacheService.get(cacheKey);

    let evidence = cachedEvidence || {
      urls: ['https://broker.example.com/api/holdings'],
      timestamp: timestampService.getCurrentTimestamp(),
      confidence: 0.95,
      sources: [
        {
          type: 'broker',
          name: 'Zerodha',
          timestamp: timestampService.getCurrentTimestamp(),
          reliability: 0.98
        }
      ]
    };

    // Cache evidence for 5 minutes
    if (!cachedEvidence) {
      cacheService.set(cacheKey, evidence, 300);
    }

    const envelope = evidenceService.createEnvelope(portfolioData, evidence as any);
    res.json(envelope);
  } catch (err: any) {
    const timestamp = timestampService.getCurrentTimestamp();
    res.status(500).json(
      evidenceService.createErrorEnvelope(
        new Error(err.message),
        500,
        {
          urls: [],
          timestamp,
          confidence: 0,
          sources: [
            {
              type: 'error',
              name: 'API',
              timestamp,
              reliability: 0
            }
          ]
        }
      )
    );
  }
});

// POST /api/29q/validate - Validate evidence URLs
router.post('/validate', async (req, res) => {
  try {
    const { urls } = req.body;

    providerService.validateUrls(urls);

    const deduped = providerService.deduplicateUrls(urls);

    res.json({
      evidence: {
        urls: deduped,
        timestamp: timestampService.getCurrentTimestamp(),
        confidence: 0.9,
        sources: []
      },
      valid: true
    });
  } catch (err: any) {
    const timestamp = timestampService.getCurrentTimestamp();
    res.status(400).json(
      evidenceService.createErrorEnvelope(
        err,
        400,
        {
          urls: [],
          timestamp,
          confidence: 0,
          sources: []
        }
      )
    );
  }
});

export default router;
