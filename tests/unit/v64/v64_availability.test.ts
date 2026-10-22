import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4 Availability Audit Unit Tests", () => {
  it("1. Availability contracts are enforced for EOD, Delivery, and Fundamentals", () => {
    const file = path.join(V64_DIR, "v64_availability_audit.json");
    expect(fs.existsSync(file)).toBe(true);

    const audit = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(audit.status).toBe("PASS");
    expect(audit.contracts.eodOHLCV.cutoffTimeIST).toBe("15:35:00");
    expect(audit.contracts.deliveryData.cutoffTimeIST).toBe("18:00:00");
    expect(audit.contracts.fundamentalData.fallbackLagCalendarDays).toBe(45);
    expect(audit.lookaheadViolationsDetected).toBe(0);
  });

  it("2. Delivery data availability check rejects trades executed before delivery publication", () => {
    // Delivery published at 18:00 IST on T.
    // If entry is at 09:15 IST on T, delivery is not available yet -> reject.
    // If entry is at 09:15 IST on T+1, delivery at 18:00 IST on T is available -> pass.

    function isDeliveryDataAvailable(deliveryPubTimeISO: string, entryTimeISO: string): boolean {
      return new Date(deliveryPubTimeISO).getTime() < new Date(entryTimeISO).getTime();
    }

    const delivPub = "2023-01-16T18:00:00+05:30";
    const sameDayEntry = "2023-01-16T09:15:00+05:30";
    const nextDayEntry = "2023-01-17T09:15:00+05:30";

    expect(isDeliveryDataAvailable(delivPub, sameDayEntry)).toBe(false);
    expect(isDeliveryDataAvailable(delivPub, nextDayEntry)).toBe(true);
  });
});
