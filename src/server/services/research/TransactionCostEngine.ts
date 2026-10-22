import type { ExecutionConfig } from "./types.js";

export interface CostBreakdown {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  stampDuty: number;
  gst: number;

  // These are informational only.
  // They are applied to execution price by ExecutionSimulator.
  slippage: number;
  impact: number;

  statutoryTotal: number;
  total: number;
}

export class TransactionCostEngine {
  constructor(private readonly c: ExecutionConfig) {}

  estimate(
    side: "BUY" | "SELL",
    price: number,
    quantity: number
  ): CostBreakdown {
    const value = Math.abs(price * quantity);

    const brokerage = Math.min(
      this.c.brokeragePerLeg,
      value
    );

    // Delivery STT: sell side.
    const stt =
      side === "SELL"
        ? value * this.c.sttRate
        : 0;

    const exchangeTxn =
      value * this.c.exchangeTxnRate;

    const stampDuty =
      side === "BUY"
        ? value * this.c.stampDutyBuyRate
        : 0;

    const gst =
      (brokerage + exchangeTxn) *
      this.c.gstRate;

    const statutoryTotal =
      brokerage +
      stt +
      exchangeTxn +
      stampDuty +
      gst;

    return {
      brokerage,
      stt,
      exchangeTxn,
      stampDuty,
      gst,

      slippage: 0,
      impact: 0,

      statutoryTotal,
      total: statutoryTotal
    };
  }

  executionPrice(
    side: "BUY" | "SELL",
    requestedPrice: number,
    quantity: number,
    participationPct: number
  ): {
    fillPrice: number;
    slippage: number;
    impact: number;
  } {
    const value =
      Math.abs(requestedPrice * quantity);

    const slippageRate =
      this.c.slippageBps / 10_000;

    const participation =
      Math.max(
        0,
        participationPct
      );

    const impactMultiplier =
      Math.max(
        0,
        participation /
          Math.max(
            this.c.maxParticipationPct,
            1e-9
          )
      );

    const impactRate =
      (this.c.impactBps / 10_000) *
      impactMultiplier;

    const adverseRate =
      slippageRate +
      impactRate;

    const fillPrice =
      side === "BUY"
        ? requestedPrice * (1 + adverseRate)
        : requestedPrice * (1 - adverseRate);

    return {
      fillPrice,
      slippage: value * slippageRate,
      impact: value * impactRate
    };
  }
}
