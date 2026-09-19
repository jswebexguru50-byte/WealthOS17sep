import { CostBreakdown, CostComponent } from './OutcomeEvidenceTypes';

export interface TariffRule {
  effectiveFrom: string; // ISO date string e.g. "2026-04-01"
  effectiveTo?: string;
  rate: number;
  provenance: string;
}

export interface TariffSchedule {
  brokerage: TariffRule[];
  sttDelivery: TariffRule[];
  sttIntradaySell: TariffRule[];
  sttIntradayBuy: TariffRule[];
  exchangeTxn: TariffRule[];
  sebiFee: TariffRule[];
  stampDutyDeliveryBuy: TariffRule[];
  stampDutyIntradayBuy: TariffRule[];
  gst: TariffRule[];
}

const DefaultIndianEquityTariffs: TariffSchedule = {
  brokerage: [
    { effectiveFrom: '2000-01-01', rate: 0.0001, provenance: 'Configured Broker Assumption 0.01%' }
  ],
  sttDelivery: [
    { effectiveFrom: '2000-01-01', rate: 0.001, provenance: 'NSE statutory STT 0.1%' }
  ],
  sttIntradayBuy: [
    { effectiveFrom: '2000-01-01', rate: 0.0, provenance: 'NSE statutory STT Intraday Buy 0%' }
  ],
  sttIntradaySell: [
    { effectiveFrom: '2000-01-01', rate: 0.00025, provenance: 'NSE statutory STT Intraday Sell 0.025%' }
  ],
  exchangeTxn: [
    { effectiveFrom: '2000-01-01', rate: 0.0000345, provenance: 'NSE Transaction Charge 0.00345%' }
  ],
  sebiFee: [
    { effectiveFrom: '2000-01-01', rate: 0.000001, provenance: 'SEBI Turnover Fee Rs 10 / Crore' }
  ],
  stampDutyDeliveryBuy: [
    { effectiveFrom: '2020-07-01', rate: 0.00015, provenance: 'Indian Stamp Act 0.015% Delivery Buy' }
  ],
  stampDutyIntradayBuy: [
    { effectiveFrom: '2020-07-01', rate: 0.00003, provenance: 'Indian Stamp Act 0.003% Intraday Buy' }
  ],
  gst: [
    { effectiveFrom: '2017-07-01', rate: 0.18, provenance: 'GST 18% on Services' }
  ]
};

export class DateEffectiveCostEngine {
  
  private static getApplicableRule(rules: TariffRule[], dateStr: string): TariffRule {
    // Sort descending by effectiveFrom
    const sorted = [...rules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    for (const rule of sorted) {
      if (dateStr >= rule.effectiveFrom) {
        if (!rule.effectiveTo || dateStr <= rule.effectiveTo) {
          return rule;
        }
      }
    }
    throw new Error(`No applicable tariff rule found for date: ${dateStr}`);
  }

  public static calculateCost(
    price: number,
    quantity: number,
    tradeType: 'DELIVERY' | 'INTRADAY',
    isBuy: boolean,
    timestamp: string,
    schedule: TariffSchedule = DefaultIndianEquityTariffs
  ): CostBreakdown {
    const turnover = price * quantity;
    const dateStr = timestamp.slice(0, 10);
    
    const applyCost = (rule: TariffRule, baseAmount: number): CostComponent => ({
      amount: baseAmount * rule.rate,
      rateApplied: rule.rate,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      provenance: rule.provenance
    });

    const brokerageRule = this.getApplicableRule(schedule.brokerage, dateStr);
    const brokerage = applyCost(brokerageRule, turnover);

    const exchangeTxnRule = this.getApplicableRule(schedule.exchangeTxn, dateStr);
    const exchangeTxn = applyCost(exchangeTxnRule, turnover);

    const sebiFeeRule = this.getApplicableRule(schedule.sebiFee, dateStr);
    const sebiFee = applyCost(sebiFeeRule, turnover);

    let sttRule: TariffRule;
    if (tradeType === 'DELIVERY') {
      sttRule = this.getApplicableRule(schedule.sttDelivery, dateStr);
    } else {
      sttRule = isBuy 
        ? this.getApplicableRule(schedule.sttIntradayBuy, dateStr) 
        : this.getApplicableRule(schedule.sttIntradaySell, dateStr);
    }
    const stt = applyCost(sttRule, turnover);

    let stampDutyRule: TariffRule | undefined;
    let stampDutyAmount = 0;
    if (isBuy) {
      stampDutyRule = tradeType === 'DELIVERY' 
        ? this.getApplicableRule(schedule.stampDutyDeliveryBuy, dateStr)
        : this.getApplicableRule(schedule.stampDutyIntradayBuy, dateStr);
      stampDutyAmount = turnover * stampDutyRule.rate;
    } else {
      stampDutyRule = { effectiveFrom: '2000-01-01', rate: 0, provenance: 'Stamp Duty N/A on Sell' };
    }
    const stampDuty: CostComponent = {
      amount: stampDutyAmount,
      rateApplied: stampDutyRule.rate,
      effectiveFrom: stampDutyRule.effectiveFrom,
      effectiveTo: stampDutyRule.effectiveTo,
      provenance: stampDutyRule.provenance
    };

    const gstRule = this.getApplicableRule(schedule.gst, dateStr);
    const gstBase = brokerage.amount + exchangeTxn.amount + sebiFee.amount;
    const gst = applyCost(gstRule, gstBase);

    const totalCost = brokerage.amount + exchangeTxn.amount + sebiFee.amount + stt.amount + stampDuty.amount + gst.amount;

    return {
      tradeType,
      turnover,
      brokerage,
      stt,
      exchangeTxnCharge: exchangeTxn,
      sebiFee,
      stampDuty,
      gst,
      totalCost
    };
  }
}
