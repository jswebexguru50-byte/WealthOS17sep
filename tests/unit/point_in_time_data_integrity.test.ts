import { describe, expect, it } from "vitest";
import {
  DeterministicTradingCalendar,
  PITLookaheadError,
  PointInTimeDataEngine,
  PITDataset,
  eodAvailabilityTimestamp,
  filingAvailableAt
} from "../../src/server/services/research/PointInTimeDataEngine";
import { ExecutionSimulator } from "../../src/server/services/research/ExecutionSimulator";

const eod = (d:string)=>eodAvailabilityTimestamp(d);
function dataset():PITDataset {
  return {
    securities:[
      {kind:"SECURITY",sourceId:"sec-old",sourceType:"exchange",availableAt:"2018-01-01T00:00:00+05:30",
       symbol:"OLD",listingDate:"2010-01-01",delistingDate:"2020-01-06",status:"DELISTED"},
      {kind:"SECURITY",sourceId:"sec-abc",sourceType:"exchange",availableAt:"2018-01-01T00:00:00+05:30",
       symbol:"ABC",listingDate:"2010-01-01",status:"ACTIVE"}
    ],
    memberships:[
      {kind:"INDEX_MEMBERSHIP",sourceId:"idx-old",sourceType:"exchange",availableAt:"2019-12-01T10:00:00+05:30",
       indexName:"NIFTY50",symbol:"OLD",effectiveFrom:"2019-01-01",effectiveTo:"2020-01-06"},
      {kind:"INDEX_MEMBERSHIP",sourceId:"idx-abc",sourceType:"exchange",availableAt:"2020-01-06T10:00:00+05:30",
       indexName:"NIFTY50",symbol:"ABC",effectiveFrom:"2020-01-06"}
    ],
    prices:[
      {kind:"PRICE",sourceId:"px-old",sourceType:"exchange",availableAt:eod("2020-01-03"),symbol:"OLD",
       timestamp:eod("2020-01-03"),open:100,high:110,low:90,close:105,volume:1000,raw:true},
      {kind:"PRICE",sourceId:"px-abc",sourceType:"exchange",availableAt:eod("2020-01-03"),symbol:"ABC",
       timestamp:eod("2020-01-03"),open:100,high:110,low:90,close:105,volume:1000,raw:true},
      {kind:"PRICE",sourceId:"px-future",sourceType:"exchange",availableAt:eod("2020-01-06"),symbol:"ABC",
       timestamp:eod("2020-01-06"),open:120,high:130,low:115,close:125,volume:1200,raw:true}
    ],
    corporateActions:[
      {kind:"CORPORATE_ACTION",sourceId:"split",sourceType:"exchange",availableAt:"2020-01-06T09:00:00+05:30",
       symbol:"ABC",actionType:"SPLIT",exDate:"2020-01-06",effectiveTimestamp:"2020-01-06T09:15:00+05:30",
       ratioNumerator:2,ratioDenominator:1},
      {kind:"CORPORATE_ACTION",sourceId:"div",sourceType:"exchange",availableAt:"2019-12-20T10:00:00+05:30",
       symbol:"ABC",actionType:"DIVIDEND",exDate:"2020-01-06",effectiveTimestamp:"2020-01-06T09:15:00+05:30",amount:5}
    ],
    fundamentals:[
      {kind:"FUNDAMENTAL",sourceId:"filing",sourceType:"exchange-filing",availableAt:"2020-01-05T12:00:00+05:30",
       announcementTimestamp:"2020-01-05T12:00:00+05:30",symbol:"ABC",fiscalPeriodEnd:"2019-12-31",metrics:{pat:100}},
      {kind:"SHAREHOLDING",sourceId:"sh",sourceType:"exchange-filing",availableAt:"2020-01-05T13:00:00+05:30",
       announcementTimestamp:"2020-01-05T13:00:00+05:30",symbol:"ABC",fiscalPeriodEnd:"2019-12-31",metrics:{promoterPct:52}}
    ]
  };
}

describe("R1 PIT-001..010",()=>{
  it("PIT-001 delisted security remains historical",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(e.getSecurities("2020-01-05T10:00:00+05:30").map(x=>x.symbol)).toContain("OLD");
    expect(e.getSecurities("2020-01-06T10:00:00+05:30").map(x=>x.symbol)).not.toContain("OLD");
  });
  it("PIT-002 historical index membership",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(e.getIndexMembers("NIFTY50","2020-01-03T15:35:00+05:30").map(x=>x.symbol)).toEqual(["OLD"]);
    expect(e.getIndexMembers("NIFTY50","2020-01-06T10:01:00+05:30").map(x=>x.symbol)).toEqual(["ABC"]);
  });
  it("PIT-003 backward split adjustment",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(e.getBackwardAdjustedPrice("ABC","2020-01-03","2020-01-05T16:00:00+05:30").close).toBe(105);
    expect(e.getBackwardAdjustedPrice("ABC","2020-01-03","2020-01-06T10:00:00+05:30").close).toBe(52.5);
  });
  it("PIT-004 dividend visible on ex-date, not before",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(e.getCorporateActions("ABC","2020-01-05T16:00:00+05:30")).toHaveLength(0);
    expect(e.getCorporateActions("ABC","2020-01-06T10:00:00+05:30").some(x=>x.actionType==="DIVIDEND")).toBe(true);
  });
  it("PIT-005 exact filing timestamp precedes fallback",()=>{
    expect(filingAvailableAt({fiscalPeriodEnd:"2019-12-31",announcementTimestamp:"2020-01-05T12:00:00+05:30"}))
      .toBe("2020-01-05T12:00:00+05:30");
    expect(filingAvailableAt({fiscalPeriodEnd:"2019-12-31"}))
      .toBe("2020-02-14T23:59:59+05:30");
  });
  it("PIT-006 shareholding cannot precede publication",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(()=>e.getShareholding("ABC","2020-01-05T12:59:59+05:30")).toThrow(PITLookaheadError);
    expect(e.getShareholding("ABC","2020-01-05T13:00:00+05:30").metrics.promoterPct).toBe(52);
  });
  it("PIT-007 EOD and future intraday data are blocked",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(()=>e.getEodPrice("ABC","2020-01-03","2020-01-03T15:34:59+05:30")).toThrow(PITLookaheadError);
    expect(()=>e.getPrice("ABC","2020-01-06T10:00:00+05:30")).toThrow(PITLookaheadError);
  });
  it("PIT-008 corporate action does not retroactively exist before effective date",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(e.getBackwardAdjustedPrice("ABC","2020-01-03","2020-01-05T16:00:00+05:30").close).toBe(105);
  });
  it("PIT-009 suspended/illiquid security represented historically and execution layer refuses trade",()=>{
    const ds = dataset();
    ds.securities.push({
      kind:"SECURITY", sourceId:"sec-susp", sourceType:"exchange", availableAt:"2018-01-01T00:00:00+05:30",
      symbol:"SUSP", listingDate:"2010-01-01", status:"SUSPENDED"
    });
    ds.prices.push({
      kind:"PRICE", sourceId:"px-susp", sourceType:"exchange", availableAt:eod("2020-01-03"),
      symbol:"SUSP", timestamp:eod("2020-01-03"), open:50, high:50, low:50, close:50, volume:0, raw:true
    });
    const e = new PointInTimeDataEngine(ds);
    // 1. PIT data layer: security and price exist historically with SUSPENDED status
    const sec = e.getSecurities("2020-01-03T15:35:00+05:30").find(x => x.symbol === "SUSP");
    expect(sec).toBeDefined();
    expect(sec?.status).toBe("SUSPENDED");

    // 2. Execution layer separation: ExecutionSimulator refuses execution on untradable/suspended bar
    const sim = new ExecutionSimulator({
      initialCapital: 100000, brokeragePerLeg: 20, sttRate: 0.001, stampDutyBuyRate: 0.00015,
      exchangeTxnRate: 0.0000345, gstRate: 0.18, slippageBps: 10, impactBps: 5,
      maxParticipationPct: 0.015, allowShortCash: false
    }, "TEST-SUSP", "SUSP-TEST");
    
    const suspendedBar = {
      timestamp: "2020-01-03T15:35:00+05:30", symbol: "SUSP", open: 50, high: 50, low: 50, close: 50,
      volume: 0, deliveryVolume: 0, tradable: false
    };
    const signal = {
      timestamp: "2020-01-03T15:35:00+05:30", symbol: "SUSP", strategyId: "S1", direction: "LONG" as const,
      entry: 50, stop: 45, target: 60, rawStrength: 1.0, qualityScore: 80, features: {}
    };
    const res = sim.run([signal], [suspendedBar], "A_RAW");
    expect(res.trades).toHaveLength(0);
    expect(res.fills).toHaveLength(0);
  });
  it("PIT-009b calendar identifies non-session, holidays and next session",()=>{
    const c=new DeterministicTradingCalendar(["2020-01-02","2020-01-03","2020-01-06"]);
    expect(c.isTradingDay("2020-01-04")).toBe(false);
    expect(c.nextTradingDay("2020-01-03")).toBe("2020-01-06");
  });
  it("PIT-010 missing data fails closed",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(()=>e.getPrice("MISSING","2020-01-03T16:00:00+05:30")).toThrow(/No PIT price/);
  });
  it("PIT-011 future-read guard blocks 10:00 strategy decision from reading 15:35 close/high/low/volume",()=>{
    const e=new PointInTimeDataEngine(dataset());
    expect(()=>e.getEodPrice("ABC","2020-01-03","2020-01-03T10:00:00+05:30")).toThrow(PITLookaheadError);
  });
  it("PIT-012 filing announced at 16:30 is strictly unavailable to simulation at 15:00",()=>{
    const ds = dataset();
    ds.fundamentals.push({
      kind:"FUNDAMENTAL", sourceId:"filing-late", sourceType:"exchange-filing",
      availableAt:"2020-01-05T16:30:00+05:30", announcementTimestamp:"2020-01-05T16:30:00+05:30",
      symbol:"LATE", fiscalPeriodEnd:"2019-12-31", metrics:{pat:250}
    });
    const e=new PointInTimeDataEngine(ds);
    expect(()=>e.getFundamental("LATE","2020-01-05T15:00:00+05:30")).toThrow(PITLookaheadError);
  });
  it("PIT-013 corporate action announced May 5 effective May 10 cannot alter price reality on May 6",()=>{
    const ds = dataset();
    ds.corporateActions.push({
      kind:"CORPORATE_ACTION", sourceId:"ca-may", sourceType:"exchange",
      availableAt:"2020-05-05T09:00:00+05:30", symbol:"ABC", actionType:"SPLIT",
      exDate:"2020-05-10", effectiveTimestamp:"2020-05-10T09:15:00+05:30",
      ratioNumerator:2, ratioDenominator:1
    });
    ds.prices.push({
      kind:"PRICE", sourceId:"px-may-3", sourceType:"exchange", availableAt:eod("2020-05-03"),
      symbol:"ABC", timestamp:eod("2020-05-03"), open:200, high:210, low:195, close:200, volume:1000, raw:true
    });
    const e=new PointInTimeDataEngine(ds);
    const actions = e.getCorporateActions("ABC","2020-05-06T15:35:00+05:30");
    expect(actions.some(a=>a.sourceId==="ca-may")).toBe(false);
    expect(e.getBackwardAdjustedPrice("ABC","2020-05-03","2020-05-06T15:35:00+05:30").close).toBe(200);
  });
});
