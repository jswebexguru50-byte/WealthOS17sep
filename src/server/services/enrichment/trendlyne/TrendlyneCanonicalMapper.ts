/**
 * TrendlyneCanonicalMapper.ts — Maps normalized Trendlyne metrics to WealthOS Canonical Repositories
 * WealthOS V2 Mandatory Amendment
 *
 * Implements:
 * - Provider precedence: Official filings (NSE/BSE) > Issuer official > Trendlyne.
 * - Reconciles against existing canonical facts:
 *   - Agreement within tolerance -> mark VERIFIED.
 *   - Disagreement -> mark SOURCE_CONFLICT (never overwrite official truth silently).
 * - Enforces single write authority through CanonicalFactRepository and CompanyEventRepository.
 */

import crypto from 'crypto';
import { CanonicalFactRepository } from '../../intelligence/core/CanonicalFactRepository.js';
import { CompanyEventRepository } from '../../intelligence/core/CompanyEventRepository.js';
import { NormalizedTrendlyneMetric } from './TrendlyneNormalizer.js';

export interface MappingResult {
  factsCreated: number;
  factsVerified: number;
  conflictsDetected: number;
  eventsCreated: number;
}

export class TrendlyneCanonicalMapper {
  private static instance: TrendlyneCanonicalMapper;
  private readonly factRepo: CanonicalFactRepository;
  private readonly eventRepo: CompanyEventRepository;

  private constructor(
    factRepo = CanonicalFactRepository.getInstance(),
    eventRepo = CompanyEventRepository.getInstance()
  ) {
    this.factRepo = factRepo;
    this.eventRepo = eventRepo;
  }

  public static getInstance(): TrendlyneCanonicalMapper {
    if (!TrendlyneCanonicalMapper.instance) {
      TrendlyneCanonicalMapper.instance = new TrendlyneCanonicalMapper();
    }
    return TrendlyneCanonicalMapper.instance;
  }

  public async mapAndPersistMetrics(
    metrics: NormalizedTrendlyneMetric[],
    asOfDate?: string
  ): Promise<MappingResult> {
    const result: MappingResult = {
      factsCreated: 0,
      factsVerified: 0,
      conflictsDetected: 0,
      eventsCreated: 0,
    };

    const effectiveDate = asOfDate || new Date().toISOString().substring(0, 10);

    for (const item of metrics) {
      if (!item.canonicalMetric || item.value === null) continue;

      const factId = crypto
        .createHash('sha256')
        .update(`trendlyne:${item.symbol}:${item.canonicalMetric}:${effectiveDate}`)
        .digest('hex');

      // Check existing fact for this security
      const existing = await this.factRepo.getFactsForSecurity({
        securityId: item.symbol,
        isin: item.symbol,
        nseSymbol: item.symbol,
        companyName: item.symbol,
      });
      const matchingExisting = existing.find((f) => f.metric === item.canonicalMetric);

      let verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'DERIVED' | 'SOURCE_CONFLICT' = 'UNVERIFIED';

      if (matchingExisting) {
        if (typeof matchingExisting.value === 'number' && typeof item.value === 'number') {
          const diffPct = Math.abs(matchingExisting.value - item.value) / (Math.abs(matchingExisting.value) || 1);
          if (diffPct <= 0.05) {
            verificationStatus = 'VERIFIED';
            result.factsVerified += 1;
          } else {
            verificationStatus = 'SOURCE_CONFLICT';
            result.conflictsDetected += 1;
            // Never overwrite existing official fact
            continue;
          }
        }
      }

      await this.factRepo.persistFact({
        factId,
        companyId: item.symbol,
        isin: item.symbol,
        symbol: item.symbol,
        metric: item.canonicalMetric,
        value: typeof item.value === 'number' ? item.value : 0,
        unit: item.unit || 'INR_CR',
        periodType: item.periodType || 'LATEST',
        periodEnd: effectiveDate,
        asOfDate: effectiveDate,
        reportedAt: item.retrievedAt,
        availableAt: item.retrievedAt,
        factType: 'REPORTED',
        sourceType: 'TRENDLYNE_SNAPSHOT',
        scope: 'CONSOLIDATED',
        provider: 'TRENDLYNE_MCP_MAX',
        verificationStatus: verificationStatus as any,
        sourceDocumentId: item.sourceDocId || 'trendlyne_mcp',
        sourceUrl: null,
        evidenceText: `Trendlyne MCP Max parameter ${item.providerMetricId}`,
        calculationMethod: 'DIRECT_OBSERVATION',
      });

      result.factsCreated += 1;
    }

    return result;
  }
}
