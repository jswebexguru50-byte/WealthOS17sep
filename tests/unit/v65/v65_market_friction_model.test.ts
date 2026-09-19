import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("v6.5 Market Friction Model Tests", () => {
  it("should confirm date-effective statutory schedule contains all 5 tax/fee components", () => {
    const costPath = path.join(process.cwd(), "data", "v6.5", "v65_transaction_cost_schedule.json");
    expect(fs.existsSync(costPath)).toBe(true);
    const schedule = JSON.parse(fs.readFileSync(costPath, "utf-8"));
    expect(schedule.statutorySchedule.sttPurchaseDeliveryPct).toBe(0.10);
    expect(schedule.statutorySchedule.sttSaleDeliveryPct).toBe(0.10);
    expect(schedule.statutorySchedule.stampDutyPurchasePct).toBe(0.015);
    expect(schedule.statutorySchedule.sebiTurnoverFeePct).toBe(0.0001);
    expect(schedule.statutorySchedule.exchangeTransactionChargePct).toBe(0.00345);
    expect(schedule.statutorySchedule.gstPctOnExchangeAndBrokerage).toBe(18.0);
  });
});
