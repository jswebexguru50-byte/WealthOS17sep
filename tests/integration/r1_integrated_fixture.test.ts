import { describe, expect, it } from "vitest";
import { PointInTimeDataEngine, PITDataset } from "../../src/server/services/research/PointInTimeDataEngine";

const ds:PITDataset={
  securities:[
    {kind:"SECURITY",sourceId:"s1",sourceType:"exchange",availableAt:"2019-01-01T00:00:00+05:30",
     symbol:"DEL",listingDate:"2010-01-01",delistingDate:"2021-01-10",status:"DELISTED"}
  ],
  memberships:[
    {kind:"INDEX_MEMBERSHIP",sourceId:"i1",sourceType:"exchange",availableAt:"2020-12-01T10:00:00+05:30",
     indexName:"TEST",symbol:"DEL",effectiveFrom:"2020-01-01",effectiveTo:"2021-01-10"}
  ],
  prices:[
    {kind:"PRICE",sourceId:"p1",sourceType:"exchange",availableAt:"2021-01-08T15:35:00+05:30",
     symbol:"DEL",timestamp:"2021-01-08T15:35:00+05:30",open:100,high:110,low:95,close:105,volume:1000,raw:true}
  ],
  corporateActions:[],
  fundamentals:[]
};

describe("R1 integrated deterministic fixture",()=>{
  it("reconstructs a historically valid snapshot without future reads",()=>{
    const e=new PointInTimeDataEngine(ds);
    const members=e.getIndexMembers("TEST","2021-01-08T16:00:00+05:30");
    const price=e.getEodPrice("DEL","2021-01-08","2021-01-08T16:00:00+05:30");
    expect(members.map(x=>x.symbol)).toEqual(["DEL"]);
    expect(price.close).toBe(105);
    e.assertCleanRun();
    expect(e.auditEvents.some(x=>x.event==="FAIL"&&x.reason==="FUTURE_READ")).toBe(false);
  });
});
