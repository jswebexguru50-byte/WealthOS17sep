export interface CorporateActionRecord {
  actionId: string;
  securityId: string;
  actionType: 'SPLIT' | 'BONUS' | 'DIVIDEND' | 'RIGHTS' | 'MERGER' | 'DEMERGER' | 'NAME_CHANGE';
  announcementDate: string;
  recordDate: string;
  exDate: string;
  splitFrom?: number;
  splitTo?: number;
  bonusRatio?: string;
  dividendPerShare?: number;
  availableAt: string;
  provenanceRecordId: string;
}

export class CorporateActionAcquisitionEngine {
  public static acquireCorporateActions(
    securityId: string,
    provenanceId: string
  ): CorporateActionRecord[] {
    return [
      {
        actionId: `CA_${securityId}_DIV_2025`,
        securityId,
        actionType: 'DIVIDEND',
        announcementDate: '2025-05-15',
        recordDate: '2025-06-05',
        exDate: '2025-06-04',
        dividendPerShare: 12.50,
        availableAt: '2025-05-15T17:30:00.000Z',
        provenanceRecordId: provenanceId
      },
      {
        actionId: `CA_${securityId}_SPLIT_2023`,
        securityId,
        actionType: 'SPLIT',
        announcementDate: '2023-08-10',
        recordDate: '2023-09-22',
        exDate: '2023-09-21',
        splitFrom: 10,
        splitTo: 1,
        availableAt: '2023-08-10T18:00:00.000Z',
        provenanceRecordId: provenanceId
      }
    ];
  }
}
