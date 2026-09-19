import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const V64_DIR = path.resolve(process.cwd(), "data", "v6.4");

describe("v6.4.1 Strategy Readiness Unit Tests", () => {
  it("1. Strategy readiness matrix restricts authorization strictly to S1 & S3 for 10-symbol subset", () => {
    const file = path.join(V64_DIR, "v641_strategy_readiness.json");
    const authFile = path.join(V64_DIR, "V641_ECONOMIC_REPLAY_AUTHORIZATION.json");

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(authFile)).toBe(true);

    const readiness = JSON.parse(fs.readFileSync(file, "utf8"));
    const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));

    expect(readiness.strategies.S1).toBe("PARTIAL");
    expect(readiness.strategies.S3).toBe("PARTIAL");
    expect(readiness.strategies.S2).toBe("DATA_INSUFFICIENT");
    expect(readiness.strategies.S12).toBe("BLOCKED");

    expect(auth.authorizedStrategies).toEqual(["S1", "S3"]);
    expect(auth.fullUniverse500Authorized).toBe(false);
    expect(auth.productionPromotionAuthorized).toBe(false);
  });
});
