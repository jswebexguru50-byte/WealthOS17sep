import crypto from 'crypto';

export type LifecycleStatus = 'DISCOVERED' | 'ANALYZED' | 'BACKTESTED' | 'PAPER_TRADE_CREATED' | 'ALERT_CREATED' | 'DOSSIER_EXPORTED' | 'REVIEWED' | 'REJECTED' | 'ARCHIVED';
export type IdStatus = 'VALID' | 'DATA_INSUFFICIENT' | 'IDENTITY_REVIEW';

export interface SignalIdGenerationParams {
  symbol: string;
  strategyId: string;
  signalDate: string | null;
  cmp: number | null;
  sourceReportFilename: string | null;
  strategyRuleSummary: string | null;
}

export interface CandidateIdGenerationParams {
  symbol: string;
  primarySignalDate: string | null;
  strategyIds: string[];
  sourceScanDate: string | null;
}

export interface SignalIdResult {
  signalId: string;
  signalIdStatus: IdStatus;
  signalFingerprintSource: string;
}

export interface CandidateIdResult {
  candidateId: string;
  candidateIdStatus: IdStatus;
  lifecycleStatus: LifecycleStatus;
}

export class CandidateLifecycleIdService {
  public static generateSignalId(params: SignalIdGenerationParams): SignalIdResult {
    if (!params.symbol || params.symbol.trim() === '') {
      return {
        signalId: 'SIG-UNKNOWN-UNKNOWN-UNKNOWN-000000',
        signalIdStatus: 'IDENTITY_REVIEW',
        signalFingerprintSource: ''
      };
    }

    const symbol = params.symbol.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const strategy = params.strategyId?.trim().toUpperCase() || 'UNKNOWN';
    let dateStr = params.signalDate?.replace(/-/g, '') || 'UNKNOWN_DATE';
    
    let status: IdStatus = 'VALID';
    if (!params.signalDate) {
      dateStr = 'UNKNOWN_DATE';
      status = 'DATA_INSUFFICIENT';
    }

    const fingerprint = [
      symbol,
      strategy,
      params.signalDate || '',
      params.cmp || '',
      params.sourceReportFilename || '',
      params.strategyRuleSummary || ''
    ].join('|');

    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 8).toUpperCase();
    
    // Format: SIG-{YYYYMMDD}-{STRATEGY}-{SYMBOL}-{HASH}
    const safeDate = dateStr === 'UNKNOWN_DATE' ? dateStr : (dateStr.length >= 8 ? dateStr.substring(0, 8) : dateStr);
    const signalId = `SIG-${safeDate}-${strategy}-${symbol}-${hash}`;

    return {
      signalId,
      signalIdStatus: status,
      signalFingerprintSource: fingerprint
    };
  }

  public static generateCandidateId(params: CandidateIdGenerationParams): CandidateIdResult {
    if (!params.symbol || params.symbol.trim() === '') {
      return {
        candidateId: 'CAN-UNKNOWN-UNKNOWN-000000',
        candidateIdStatus: 'IDENTITY_REVIEW',
        lifecycleStatus: 'DISCOVERED'
      };
    }

    const symbol = params.symbol.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    let dateStr = params.primarySignalDate?.replace(/-/g, '') || 'UNKNOWN_DATE';
    
    let status: IdStatus = 'VALID';
    if (!params.primarySignalDate) {
      dateStr = 'UNKNOWN_DATE';
      status = 'DATA_INSUFFICIENT';
    }

    const sortedStrategies = [...(params.strategyIds || [])].map(s => s.trim().toUpperCase()).sort();

    const fingerprint = [
      symbol,
      params.primarySignalDate || '',
      sortedStrategies.join(','),
      params.sourceScanDate || ''
    ].join('|');

    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 8).toUpperCase();
    
    // Format: CAN-{YYYYMMDD}-{SYMBOL}-{HASH}
    const safeDate = dateStr === 'UNKNOWN_DATE' ? dateStr : (dateStr.length >= 8 ? dateStr.substring(0, 8) : dateStr);
    const candidateId = `CAN-${safeDate}-${symbol}-${hash}`;

    return {
      candidateId,
      candidateIdStatus: status,
      lifecycleStatus: 'DISCOVERED'
    };
  }
}
