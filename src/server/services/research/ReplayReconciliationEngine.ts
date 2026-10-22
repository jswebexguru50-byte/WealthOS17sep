import { EconomicReplayResult } from './CleanRoomEconomicReplay';
import { AuditResult } from './CleanRoomIndependentAuditor';
import { StopTheLineError } from './StopTheLineRegistry';

export class ReplayReconciliationEngine {
  private static PRICE_EPSILON = 1e-8;
  private static MONEY_EPSILON = 0.01;
  private static RETURN_EPSILON = 1e-10;

  public static compare(producer: EconomicReplayResult, auditor: AuditResult): void {
    if (producer.metrics.tradeCount !== auditor.auditedTradeCount) {
      throw new StopTheLineError(
        'PRODUCER_AUDITOR_MISMATCH',
        `Trade count mismatch. Producer: ${producer.metrics.tradeCount}, Auditor: ${auditor.auditedTradeCount}`
      );
    }

    if (Math.abs(producer.metrics.expectancyR - auditor.auditedExpectancyR) > this.RETURN_EPSILON) {
      throw new StopTheLineError(
        'PRODUCER_AUDITOR_MISMATCH',
        `Expectancy R mismatch. Producer: ${producer.metrics.expectancyR}, Auditor: ${auditor.auditedExpectancyR}`
      );
    }

    let producerTotalNet = 0;
    for (const pt of producer.trades) {
      const at = auditor.auditedTrades[pt.tradeId];
      if (!at) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Auditor missing trade ${pt.tradeId}`);
      }

      if (Math.abs(pt.entry - at.calculatedEntry) > this.PRICE_EPSILON) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Entry mismatch on trade ${pt.tradeId}`);
      }

      if (Math.abs(pt.exit - at.calculatedExit) > this.PRICE_EPSILON) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Exit mismatch on trade ${pt.tradeId}`);
      }

      if (Math.abs(pt.gross - at.calculatedGross) > this.MONEY_EPSILON) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Gross PNL mismatch on trade ${pt.tradeId}`);
      }

      if (Math.abs(pt.net - at.calculatedNet) > this.MONEY_EPSILON) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Net PNL mismatch on trade ${pt.tradeId}`);
      }

      if (pt.R !== null && at.calculatedR !== null) {
        if (Math.abs(pt.R - at.calculatedR) > this.RETURN_EPSILON) {
          throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `R mismatch on trade ${pt.tradeId}`);
        }
      } else if (pt.R !== at.calculatedR) {
        throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `R null mismatch on trade ${pt.tradeId}`);
      }

      producerTotalNet += pt.net;
    }

    if (Math.abs(producerTotalNet - auditor.auditedTotalNetPnl) > this.MONEY_EPSILON) {
      throw new StopTheLineError('PRODUCER_AUDITOR_MISMATCH', `Total Net PNL mismatch`);
    }
  }
}
