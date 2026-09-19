import { AcquisitionTask, AcquisitionQueue } from './AcquisitionQueue';
import { DataSourceRegistry } from './DataSourceRegistry';
import { DataProvenanceLedger } from './DataProvenanceLedger';
import { HistoricalDataAcquisitionEngine } from './HistoricalDataAcquisitionEngine';
import { CurrentDataAcquisitionEngine } from './CurrentDataAcquisitionEngine';
import { FundamentalEnrichmentEngine } from './FundamentalEnrichmentEngine';
import { CorporateActionAcquisitionEngine } from './CorporateActionAcquisitionEngine';
import { ShareholdingAcquisitionEngine } from './ShareholdingAcquisitionEngine';
import { EventAcquisitionEngine } from './EventAcquisitionEngine';
import { IntradayAcquisitionEngine } from './IntradayAcquisitionEngine';
import { DerivativesAcquisitionEngine } from './DerivativesAcquisitionEngine';
import { SectorIndexAcquisitionEngine } from './SectorIndexAcquisitionEngine';
import { SurveillanceAcquisitionEngine } from './SurveillanceAcquisitionEngine';
import { PITDataValidator } from './PITDataValidator';
import { DataQualityGate } from './DataQualityGate';
import { DataCoverageValidator } from './DataCoverageValidator';

export class AcquisitionWorker {
  public readonly workerId: string;
  private queue: AcquisitionQueue;
  private sourceRegistry: DataSourceRegistry;
  private provenanceLedger: DataProvenanceLedger;
  private isRunning: boolean = false;

  constructor(
    workerId: string,
    queue: AcquisitionQueue,
    sourceRegistry: DataSourceRegistry,
    provenanceLedger: DataProvenanceLedger
  ) {
    this.workerId = workerId;
    this.queue = queue;
    this.sourceRegistry = sourceRegistry;
    this.provenanceLedger = provenanceLedger;
  }

  public async processTask(task: AcquisitionTask): Promise<void> {
    const policy = this.sourceRegistry.getPolicy(task.sourceId);
    if (!policy || !policy.enabled) {
      this.queue.updateTaskStatus(task.taskId, 'SOURCE_UNAVAILABLE', { error: `Source ${task.sourceId} unavailable or disabled` });
      return;
    }

    try {
      // 1. ACQUIRING & RAW STORAGE
      this.queue.updateTaskStatus(task.taskId, 'ACQUIRING');
      let rawData: any = [];

      switch (task.domain) {
        case 'D2_DAILY_OHLCV':
          rawData = HistoricalDataAcquisitionEngine.acquireDailyOHLCV(
            task.securityId,
            task.symbol,
            task.startDate || '2020-01-01',
            task.endDate || '2026-09-18',
            task.taskId
          );
          break;

        case 'D4_FINANCIAL_STATEMENTS':
          rawData = FundamentalEnrichmentEngine.acquireStatements(task.securityId, task.taskId);
          break;

        case 'D3_CORPORATE_ACTIONS':
          rawData = CorporateActionAcquisitionEngine.acquireCorporateActions(task.securityId, task.taskId);
          break;

        case 'D5_SHAREHOLDING':
          rawData = ShareholdingAcquisitionEngine.acquireShareholdingPattern(task.securityId, task.taskId);
          break;

        case 'D6_EVENTS':
          rawData = EventAcquisitionEngine.acquireEvents(task.securityId, task.taskId);
          break;

        case 'D7_INTRADAY':
          rawData = IntradayAcquisitionEngine.acquireIntradayBars(task.securityId, '5M', task.startDate || '2026-09-18', task.taskId);
          break;

        case 'D8_FNO':
          rawData = DerivativesAcquisitionEngine.acquireDerivativesData(task.securityId, task.symbol, task.startDate || '2026-09-18', task.taskId);
          break;

        case 'D9_SECTOR_INDEX':
          rawData = SectorIndexAcquisitionEngine.acquireSectorIndex('NIFTY500', task.startDate || '2026-09-18', task.taskId);
          break;

        case 'D10_SURVEILLANCE':
          rawData = SurveillanceAcquisitionEngine.acquireSurveillanceData(task.securityId, task.symbol, task.startDate || '2026-09-18', task.taskId);
          break;

        default:
          rawData = CurrentDataAcquisitionEngine.acquireCurrentQuote(task.securityId, task.symbol, task.taskId);
          break;
      }

      // Append immutable raw provenance
      const provRec = this.provenanceLedger.appendRawRecord(
        task.sourceId,
        task.securityId,
        task.domain,
        { start: task.startDate, end: task.endDate },
        rawData
      );
      this.queue.updateTaskStatus(task.taskId, 'RAW_STORED', { recordsCount: provRec.recordCount });

      // 2. NORMALIZATION
      this.queue.updateTaskStatus(task.taskId, 'NORMALIZED');

      // 3. PIT VALIDATION
      this.queue.updateTaskStatus(task.taskId, 'PIT_VALIDATING');
      if (Array.isArray(rawData)) {
        for (const item of rawData) {
          const pitCheck = PITDataValidator.validateRecord(task.domain, item);
          if (!pitCheck.isValid) {
            this.queue.updateTaskStatus(task.taskId, 'FAILED', { error: `PIT Validation failed: ${pitCheck.violations.join(', ')}` });
            return;
          }
        }
      }

      // 4. QUALITY & COVERAGE VALIDATION
      this.queue.updateTaskStatus(task.taskId, 'COVERAGE_VALIDATING');
      if (task.domain === 'D2_DAILY_OHLCV' && Array.isArray(rawData)) {
        for (const r of rawData.slice(0, 100)) {
          const qual = DataQualityGate.verifyOHLCVQuality(r);
          if (!qual.passed) {
            this.queue.updateTaskStatus(task.taskId, 'FAILED', { error: `Quality check failed: ${qual.anomalies.join(', ')}` });
            return;
          }
        }
        const dates = rawData.map(r => r.date);
        const cov = DataCoverageValidator.validateDailyCoverage(task.securityId, dates, task.startDate || '2020-01-01', task.endDate || '2026-09-18');
        if (!cov.isCoverageSufficient) {
          this.queue.updateTaskStatus(task.taskId, 'PARTIAL', { error: `Coverage insufficient (${cov.coveragePercentage.toFixed(1)}%)` });
          return;
        }
      }

      // 5. MARK RESEARCH READY
      this.queue.updateTaskStatus(task.taskId, 'RESEARCH_READY', { recordsCount: provRec.recordCount });

    } catch (err: any) {
      if (task.attemptCount < task.maxAttempts) {
        this.queue.updateTaskStatus(task.taskId, 'QUEUED', { error: `Transient failure: ${err.message}` });
      } else {
        this.queue.updateTaskStatus(task.taskId, 'FAILED', { error: `Max attempts exceeded: ${err.message}` });
      }
    }
  }
}
