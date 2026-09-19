/**
 * WealthOS v6.6–v6.7 - Execution Gateway
 * Execution Architecture
 * 
 * SPEC MANDATE:
 * Authoritative interface for all order validation and submission:
 * - Completely independent of Fenix or any specific broker.
 * - Enforces pre-execution policy checks before any broker receives an order.
 * - Blocks LIVE execution if productionPromotionAuthorized = false.
 */

import crypto from 'crypto';
import { ExecutionIntent } from './ExecutionIntent.js';
import { ExecutionResult, ExecutionValidationResult } from './ExecutionResult.js';
import { ExecutionPolicy } from './ExecutionPolicy.js';
import { FenixExecutionAdapter } from '../reference/fenix/FenixExecutionAdapter.js';

export class ExecutionGateway {
  private static instance: ExecutionGateway;
  private policy = ExecutionPolicy.getInstance();
  private fenixAdapter = new FenixExecutionAdapter();
  private orders = new Map<string, ExecutionResult>();
  private readonly productionPromotionAuthorized = false; // HARD CODED TYPE-LEVEL INVARIANT

  public static getInstance(): ExecutionGateway {
    if (!ExecutionGateway.instance) {
      ExecutionGateway.instance = new ExecutionGateway();
    }
    return ExecutionGateway.instance;
  }

  public async validate(intent: ExecutionIntent): Promise<ExecutionValidationResult> {
    return this.policy.validateIntent(intent, this.productionPromotionAuthorized);
  }

  public async submit(intent: ExecutionIntent): Promise<ExecutionResult> {
    const validation = await this.validate(intent);

    if (!validation.authorized) {
      const rejectedResult: ExecutionResult = {
        intentId: intent.intentId,
        provider: 'EXECUTION_GATEWAY',
        status: 'REJECTED',
        filledQuantity: 0,
        rejectionCode: validation.rejectionCode,
        rejectionReason: validation.rejectionReason,
        providerTimestamp: new Date().toISOString(),
        rawResponseHash: crypto.createHash('sha256').update(JSON.stringify(validation)).digest('hex'),
        executedAt: new Date().toISOString()
      };
      this.orders.set(intent.intentId, rejectedResult);
      return rejectedResult;
    }

    // Submit to execution adapter (e.g. Fenix Paper / Research Simulator)
    const rawResult = await this.fenixAdapter.submitOrder(
      {
        intentId: intent.intentId,
        exchange: intent.exchange,
        symbol: intent.securityId,
        side: intent.side,
        quantity: intent.quantity,
        orderType: intent.orderType,
        price: intent.limitPrice,
        triggerPrice: intent.triggerPrice,
        product: intent.product,
        environment: intent.environment
      },
      this.productionPromotionAuthorized
    );

    const executionResult: ExecutionResult = {
      ...rawResult,
      executedAt: new Date().toISOString()
    };

    this.orders.set(intent.intentId, executionResult);
    return executionResult;
  }

  public async cancel(intentId: string): Promise<ExecutionResult> {
    const existing = this.orders.get(intentId);
    if (!existing) {
      throw new Error(`Order intent ${intentId} not found`);
    }

    const cancelled: ExecutionResult = {
      ...existing,
      status: 'CANCELLED',
      executedAt: new Date().toISOString()
    };
    this.orders.set(intentId, cancelled);
    return cancelled;
  }

  public async getOrder(intentId: string): Promise<ExecutionResult | undefined> {
    return this.orders.get(intentId);
  }

  public async getPositions(): Promise<Array<{ securityId: string; quantity: number }>> {
    return [];
  }

  public async getHoldings(): Promise<Array<{ securityId: string; quantity: number }>> {
    return [];
  }

  public async getMargins(): Promise<{ availableCashINR: number; usedMarginINR: number }> {
    return { availableCashINR: 10000000, usedMarginINR: 0 };
  }
}
