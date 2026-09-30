/**
 * TrendlyneStructuredDataAdapter.ts — Multi-Stock Structured Financial & Market Data Adapter
 * WealthOS V2 Mandatory Amendment
 */

import { TrendlyneMcpClient } from './TrendlyneMcpClient.js';
import { TrendlyneNormalizer, NormalizedTrendlyneMetric } from './TrendlyneNormalizer.js';
import { TrendlyneCanonicalMapper, MappingResult } from './TrendlyneCanonicalMapper.js';
import { PlannedBatchCall } from './TrendlyneBatchPlanner.js';

export class TrendlyneStructuredDataAdapter {
  private static instance: TrendlyneStructuredDataAdapter;
  private readonly client: TrendlyneMcpClient;
  private readonly normalizer: TrendlyneNormalizer;
  private readonly mapper: TrendlyneCanonicalMapper;

  private constructor(
    client = TrendlyneMcpClient.getInstance(),
    normalizer = TrendlyneNormalizer.getInstance(),
    mapper = TrendlyneCanonicalMapper.getInstance()
  ) {
    this.client = client;
    this.normalizer = normalizer;
    this.mapper = mapper;
  }

  public static getInstance(): TrendlyneStructuredDataAdapter {
    if (!TrendlyneStructuredDataAdapter.instance) {
      TrendlyneStructuredDataAdapter.instance = new TrendlyneStructuredDataAdapter();
    }
    return TrendlyneStructuredDataAdapter.instance;
  }

  public async executeBatchCall(call: PlannedBatchCall): Promise<{
    rawResponseId: string;
    normalizedMetrics: NormalizedTrendlyneMetric[];
    mappingResult: MappingResult;
  }> {
    const symbols = call.scrips.map((s) => s.symbol);
    const { data, rawResponseId } = await this.client.getStockParameterValues(symbols, call.metricIds);
    const normalizedMetrics = this.normalizer.normalizeStructuredData(data, rawResponseId);
    const mappingResult = await this.mapper.mapAndPersistMetrics(normalizedMetrics);

    return {
      rawResponseId,
      normalizedMetrics,
      mappingResult,
    };
  }
}
