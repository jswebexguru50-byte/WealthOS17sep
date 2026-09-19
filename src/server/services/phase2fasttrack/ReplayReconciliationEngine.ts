export interface ReconciliationReport {
  candidateCount: number;
  executedTradeCount: number;
  dataInsufficientCount: number;
  rejectedCount: number;
  reconciled: boolean;
}

export class ReplayReconciliationEngine {
  private candidateCount = 0;
  private executedTradeCount = 0;
  private dataInsufficientCount = 0;
  private rejectedCount = 0;

  public registerCandidate() {
    this.candidateCount++;
  }

  public registerExecutedTrade() {
    this.executedTradeCount++;
  }

  public registerDataInsufficient() {
    this.dataInsufficientCount++;
  }

  public registerRejected() {
    this.rejectedCount++;
  }

  public getReport(): ReconciliationReport {
    const totalProcessed = this.executedTradeCount + this.dataInsufficientCount + this.rejectedCount;
    const reconciled = this.candidateCount === totalProcessed;

    return {
      candidateCount: this.candidateCount,
      executedTradeCount: this.executedTradeCount,
      dataInsufficientCount: this.dataInsufficientCount,
      rejectedCount: this.rejectedCount,
      reconciled
    };
  }

  public verifyStrictReconciliation(): void {
    const report = this.getReport();
    if (!report.reconciled) {
      throw new Error(`Hard failure: Replay reconciliation mismatch! candidate observations: ${report.candidateCount}, executed trades: ${report.executedTradeCount}, DATA_INSUFFICIENT: ${report.dataInsufficientCount}, explicit rejects: ${report.rejectedCount}`);
    }
  }
}
