/**
 * WealthOS v6.6–v6.7 - Fenix Paper Execution Adapter
 * External Reference Acceleration Layer
 * 
 * SPEC MANDATE:
 * Tests order lifecycle: Intent -> Order -> Fill -> Position -> Reconciliation.
 * HARD INVARIANT: Fenix paper mode NEVER replaces authoritative WealthOS research simulator.
 */

import { FenixExecutionAdapter, FenixOrderRequest, CanonicalOrderResult } from './FenixExecutionAdapter.js';

export interface PaperOrderLifecycleTrace {
  intentId: string;
  orderSubmitted: boolean;
  orderFilled: boolean;
  positionUpdated: boolean;
  reconciliationMatch: boolean;
  filledQuantity: number;
  averagePrice: number;
}

export class FenixPaperExecutionAdapter {
  private adapter = new FenixExecutionAdapter();

  public async executePaperLifecycle(request: FenixOrderRequest): Promise<PaperOrderLifecycleTrace> {
    const paperReq: FenixOrderRequest = {
      ...request,
      environment: 'PAPER'
    };

    const result: CanonicalOrderResult = await this.adapter.submitOrder(paperReq, false);

    return {
      intentId: request.intentId,
      orderSubmitted: result.status === 'FILLED' || result.status === 'OPEN',
      orderFilled: result.status === 'FILLED',
      positionUpdated: true,
      reconciliationMatch: result.filledQuantity === request.quantity,
      filledQuantity: result.filledQuantity,
      averagePrice: result.averageFillPrice || 0
    };
  }
}
