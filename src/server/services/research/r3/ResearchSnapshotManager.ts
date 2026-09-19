import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DataRequirement {
  dataDomain: 'DAILY_OHLCV' | 'INTRADAY_1M' | 'VOLUME_ADV' | 'MARKET_INDEX' | 'SECTOR_INDEX' | 'CORPORATE_ACTIONS' | 'SECURITY_IDENTITY' | 'PIT_UNIVERSE' | 'FINANCIAL_STATEMENTS' | 'SHAREHOLDING' | 'DERIVATIVES';
  lookbackDays: number;
  mandatory: boolean;
  frequency: 'EOD' | 'INTRADAY_1M' | 'QUARTERLY' | 'EVENT_DRIVEN';
}

export interface ResearchSnapshotDefinition {
  snapshotId: string;
  universeId: string;
  marketDataVersion: string;
  financialDataVersion: string;
  corporateActionVersion: string;
  identityVersion: string;
  PITUniverseVersion: string;
  costModelVersion: string;
  slippageModelVersion: string;
  configurationHash: string;
  methodologyHash: string;
  generatedAt: string;
  immutable: true;
}

export class ResearchSnapshotManager {
  private static readonly DEFINITION_PATH = 'config/v67/r3/R3_RESEARCH_SNAPSHOT_DEFINITION.json';

  public static getSnapshot(baseDir: string = process.cwd()): ResearchSnapshotDefinition {
    const defPath = path.resolve(baseDir, this.DEFINITION_PATH);
    if (fs.existsSync(defPath)) {
      return JSON.parse(fs.readFileSync(defPath, 'utf-8'));
    }

    // Deterministic generation from source files
    const manifestPath = path.resolve(baseDir, 'config/v67/FROZEN_V63_CONTROL_MANIFEST.json');
    const manifestBytes = fs.readFileSync(manifestPath);
    const frozenHash = crypto.createHash('sha256').update(manifestBytes).digest('hex');

    const canonicalLedgerHash = 'f2177c218c0fee5e139d563fff3f43f2b9a2ad75cdae4c96ff9228cb71a1fec3';
    const snapshotSeed = `SNAPSHOT_NIFTY500_HISTORICAL_PIT_${canonicalLedgerHash}_${frozenHash}`;
    const snapshotHash = crypto.createHash('sha256').update(snapshotSeed).digest('hex').substring(0, 16);

    const snapshot: ResearchSnapshotDefinition = {
      snapshotId: `SNP-R3-${snapshotHash.toUpperCase()}`,
      universeId: 'NIFTY500_HISTORICAL_PIT_2020_2026',
      marketDataVersion: 'NSE_EOD_HISTORICAL_V65_ED18F3B9A403',
      financialDataVersion: 'XBRL_FINANCIALS_AUDITED_PIT_V65',
      corporateActionVersion: 'NSE_BSE_CORP_ACTIONS_PIT_V65',
      identityVersion: 'SECURITY_IDENTITY_ISIN_INTERVALS_V65',
      PITUniverseVersion: 'NIFTY500_OFFICIAL_RECONSTRUCTED_V65',
      costModelVersion: 'NSE_CASH_DELIVERY_SLAB_2020_2026_STT_EXCHANGE_GST_SEBI_STAMP',
      slippageModelVersion: 'SQRT_IMPACT_PARTICIPATION_BPS_EMPIRICAL',
      configurationHash: frozenHash,
      methodologyHash: crypto.createHash('sha256').update('WEALTHOS_R3_PREDECLARED_METHODOLOGY').digest('hex'),
      generatedAt: '2026-09-18T13:00:00.000Z',
      immutable: true
    };

    const dir = path.dirname(defPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(defPath, JSON.stringify(snapshot, null, 2));
    return snapshot;
  }
}
