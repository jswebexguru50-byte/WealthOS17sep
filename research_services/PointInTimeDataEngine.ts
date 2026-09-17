import * as nodeCrypto from "node:crypto";

export type SecurityStatus = "ACTIVE" | "SUSPENDED" | "DELISTED";
export type CorporateActionType = "SPLIT" | "BONUS" | "DIVIDEND";
export type PITDataKind =
  | "SECURITY" | "INDEX_MEMBERSHIP" | "PRICE"
  | "CORPORATE_ACTION" | "FUNDAMENTAL" | "SHAREHOLDING";

export interface PITProvenance {
  sourceId: string;
  sourceType: string;
  availableAt: string;
  effectiveAt?: string;
  retrievedAt?: string;
  sourceVersion?: string;
  recordHash?: string;
}

export interface PITSecurityRecord extends PITProvenance {
  kind: "SECURITY";
  symbol: string;
  isin?: string;
  listingDate: string;
  delistingDate?: string;
  status: SecurityStatus;
  circuitLowerPct?: number;
  circuitUpperPct?: number;
}

export interface PITIndexMembershipRecord extends PITProvenance {
  kind: "INDEX_MEMBERSHIP";
  indexName: string;
  symbol: string;
  effectiveFrom: string;
  effectiveTo?: string;
  announcementDate?: string;
  effectiveDate?: string;
}

export interface PITPriceRecord extends PITProvenance {
  kind: "PRICE";
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  deliveryVolume?: number;
  raw: boolean;
  adjusted?: boolean;
}

export interface PITCorporateActionRecord extends PITProvenance {
  kind: "CORPORATE_ACTION";
  symbol: string;
  actionType: CorporateActionType;
  exDate: string;
  recordDate?: string;
  ratioNumerator?: number;
  ratioDenominator?: number;
  amount?: number;
  effectiveTimestamp: string;
}

export interface PITFundamentalDisclosure extends PITProvenance {
  kind: "FUNDAMENTAL" | "SHAREHOLDING";
  symbol: string;
  fiscalPeriodEnd: string;
  announcementTimestamp?: string;
  fallbackAvailableAt?: string;
  metrics: Record<string, number | string | null>;
}

export interface PITDataset {
  securities: PITSecurityRecord[];
  memberships: PITIndexMembershipRecord[];
  prices: PITPriceRecord[];
  corporateActions: PITCorporateActionRecord[];
  fundamentals: PITFundamentalDisclosure[];
}

export interface PITAuditEvent {
  event: "READ" | "FAIL";
  kind: PITDataKind;
  sourceId?: string;
  symbol?: string;
  simulationAsOf: string;
  availableAt?: string;
  effectiveAt?: string;
  reason?: string;
}

export class PITDataUnavailableError extends Error {
  readonly code = "PIT_DATA_UNAVAILABLE";
  constructor(message: string, readonly symbol?: string, readonly asOf?: string) {
    super(message); this.name = "PITDataUnavailableError";
  }
}

export class PITLookaheadError extends Error {
  readonly code = "INVALID_LOOKAHEAD_CONTAMINATION";
  constructor(
    message: string,
    readonly sourceId?: string,
    readonly availableAt?: string,
    readonly asOf?: string
  ) {
    super(message); this.name = "PITLookaheadError";
  }
}

export function canonicalize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Cannot canonicalize non-finite number");
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([,v]) => v !== undefined)
      .sort(([a],[b]) => a.localeCompare(b));
    return `{${entries.map(([k,v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return nodeCrypto.createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

export function isDataKnowable(recordAvailableAt: string, simulationAsOf: string): boolean {
  return recordAvailableAt <= simulationAsOf;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}

export function eodAvailabilityTimestamp(date: string, hhmm = "15:35"): string {
  return `${date}T${hhmm}:00+05:30`;
}

export function filingAvailableAt(
  d: Pick<PITFundamentalDisclosure, "announcementTimestamp"|"fallbackAvailableAt"|"fiscalPeriodEnd">,
  fallbackLagDays = 45
): string {
  if (d.announcementTimestamp) return d.announcementTimestamp;
  if (d.fallbackAvailableAt) return d.fallbackAvailableAt;
  return `${addDays(d.fiscalPeriodEnd, fallbackLagDays)}T23:59:59+05:30`;
}

export class DeterministicTradingCalendar {
  readonly sessions: string[];
  constructor(sessions: string[], readonly timezone = "Asia/Kolkata") {
    this.sessions = [...new Set(sessions)].sort();
  }
  isTradingDay(date: string) { return this.sessions.includes(date); }
  previousTradingDay(date: string) { return [...this.sessions].reverse().find(x => x < date); }
  nextTradingDay(date: string) { return this.sessions.find(x => x > date); }
}

export class PointInTimeDataEngine {
  private readonly eodAnchor: string;
  private readonly fallbackLagDays: number;
  private readonly events: PITAuditEvent[] = [];

  constructor(
    private readonly data: PITDataset,
    options: { eodAvailabilityAnchor?: string; fallbackFundamentalLagDays?: number } = {}
  ) {
    this.eodAnchor = options.eodAvailabilityAnchor ?? "15:35";
    this.fallbackLagDays = options.fallbackFundamentalLagDays ?? 45;
    this.validate();
  }

  get auditEvents() { return [...this.events]; }

  private validate() {
    for (const p of this.data.prices) {
      if (![p.open,p.high,p.low,p.close,p.volume].every(Number.isFinite)) {
        throw new Error(`Invalid numeric price record ${p.symbol}/${p.timestamp}`);
      }
      if (p.low > p.high || p.low > p.open || p.low > p.close ||
          p.high < p.open || p.high < p.close) {
        throw new Error(`Invalid OHLC ${p.symbol}/${p.timestamp}`);
      }
      if (!p.raw) throw new Error(`Source price records must be raw: ${p.symbol}/${p.timestamp}`);
    }
  }

  private guard(
    record: PITProvenance, asOf: string, kind: PITDataKind, symbol?: string
  ) {
    if (!isDataKnowable(record.availableAt, asOf)) {
      const e: PITAuditEvent = {
        event:"FAIL", kind, symbol, sourceId:record.sourceId,
        simulationAsOf:asOf, availableAt:record.availableAt,
        effectiveAt:record.effectiveAt, reason:"FUTURE_READ"
      };
      this.events.push(e);
      throw new PITLookaheadError(
        `Future read blocked: ${record.availableAt} > ${asOf}`,
        record.sourceId, record.availableAt, asOf
      );
    }
    this.events.push({
      event:"READ", kind, symbol, sourceId:record.sourceId,
      simulationAsOf:asOf, availableAt:record.availableAt,
      effectiveAt:record.effectiveAt
    });
  }

  private missing(kind: PITDataKind, message: string, symbol: string, asOf: string): never {
    this.events.push({event:"FAIL", kind, symbol, simulationAsOf:asOf, reason:"DATA_UNAVAILABLE"});
    throw new PITDataUnavailableError(message, symbol, asOf);
  }

  getSecurities(asOf: string) {
    return this.data.securities.filter(s =>
      s.listingDate <= asOf.slice(0,10) &&
      (!s.delistingDate || asOf.slice(0,10) < s.delistingDate)
    ).filter(s => { this.guard(s, asOf, "SECURITY", s.symbol); return true; });
  }

  getIndexMembers(indexName: string, asOf: string) {
    return this.data.memberships.filter(m =>
      m.indexName === indexName &&
      m.effectiveFrom <= asOf.slice(0,10) &&
      (!m.effectiveTo || asOf.slice(0,10) < m.effectiveTo)
    ).filter(m => { this.guard(m, asOf, "INDEX_MEMBERSHIP", m.symbol); return true; });
  }

  getPrice(symbol: string, asOf: string): PITPriceRecord {
    const future = this.data.prices.find(
      x => x.symbol === symbol && x.timestamp.slice(0, 10) === asOf.slice(0, 10) && x.availableAt > asOf
    );
    if (future) this.guard(future, asOf, "PRICE", symbol);

    const p = this.data.prices
      .filter(x => x.symbol === symbol && x.timestamp <= asOf)
      .sort((a,b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (!p) return this.missing("PRICE", `No PIT price for ${symbol} at ${asOf}`, symbol, asOf);
    this.guard(p, asOf, "PRICE", symbol);
    return p;
  }

  getEodPrice(symbol: string, date: string, asOf: string): PITPriceRecord {
    const available = eodAvailabilityTimestamp(date, this.eodAnchor);
    if (asOf < available) {
      throw new PITLookaheadError(
        `EOD OHLCV is not available before ${available}`, `${symbol}:${date}`, available, asOf
      );
    }
    const p = this.data.prices.find(x =>
      x.symbol === symbol && x.timestamp === available
    );
    if (!p) return this.missing("PRICE", `Missing EOD OHLCV ${symbol} ${date}`, symbol, asOf);
    this.guard(p, asOf, "PRICE", symbol);
    return p;
  }

  getFundamental(symbol: string, asOf: string) {
    const all = this.data.fundamentals
      .filter(f => f.kind === "FUNDAMENTAL" && f.symbol === symbol)
      .map(f => ({f, availableAt:filingAvailableAt(f,this.fallbackLagDays)}));
    const future = all.find(x => x.availableAt > asOf);
    const valid = all
      .filter(x => x.availableAt <= asOf)
      .sort((a,b) => b.availableAt.localeCompare(a.availableAt));
    if (!valid.length && future) {
      this.guard({...future.f, availableAt: future.availableAt}, asOf, "FUNDAMENTAL", symbol);
    }
    const x = valid[0];
    if (!x) return this.missing("FUNDAMENTAL", `No knowable fundamental for ${symbol}`, symbol, asOf);
    const out = {...x.f, availableAt:x.availableAt};
    this.guard(out, asOf, "FUNDAMENTAL", symbol);
    return out;
  }

  getShareholding(symbol: string, asOf: string) {
    const all = this.data.fundamentals
      .filter(f => f.kind === "SHAREHOLDING" && f.symbol === symbol)
      .map(f => ({f, availableAt:filingAvailableAt(f,this.fallbackLagDays)}));
    const future = all.find(x => x.availableAt > asOf);
    const valid = all
      .filter(x => x.availableAt <= asOf)
      .sort((a,b) => b.availableAt.localeCompare(a.availableAt));
    if (!valid.length && future) {
      this.guard({...future.f, availableAt: future.availableAt}, asOf, "SHAREHOLDING", symbol);
    }
    const x = valid[0];
    if (!x) return this.missing("SHAREHOLDING", `No knowable shareholding for ${symbol}`, symbol, asOf);
    const out = {...x.f, availableAt:x.availableAt};
    this.guard(out, asOf, "SHAREHOLDING", symbol);
    return out;
  }

  getCorporateActions(symbol: string, asOf: string) {
    return this.data.corporateActions
      .filter(a => a.symbol === symbol && a.exDate <= asOf.slice(0,10))
      .filter(a => { this.guard(a, asOf, "CORPORATE_ACTION", symbol); return true; })
      .sort((a,b) => a.exDate.localeCompare(b.exDate));
  }

  getBackwardAdjustedPrice(symbol: string, tradingDate: string, asOf: string) {
    const raw = this.data.prices.find(
      p => p.symbol === symbol && p.timestamp.slice(0,10) === tradingDate
    );
    if (!raw) return this.missing("PRICE", `Missing raw price ${symbol}/${tradingDate}`, symbol, asOf);
    this.guard(raw, asOf, "PRICE", symbol);

    let factor = 1;
    for (const a of this.getCorporateActions(symbol, asOf)) {
      if (a.exDate > tradingDate && (a.actionType === "SPLIT" || a.actionType === "BONUS")) {
        factor *= (a.ratioDenominator ?? 1) / (a.ratioNumerator ?? 1);
      }
    }
    return {
      ...raw,
      open:raw.open*factor, high:raw.high*factor,
      low:raw.low*factor, close:raw.close*factor,
      raw:false, adjusted:true
    };
  }

  assertCleanRun() {
    const contamination = this.events.filter(x =>
      x.event === "FAIL" && x.reason === "FUTURE_READ"
    );
    if (contamination.length) {
      throw new PITLookaheadError(
        `PIT run contaminated: ${contamination.length} future read(s)`
      );
    }
  }

  snapshotHash(asOf: string) {
    return sha256Canonical({
      asOf,
      securities:this.getSecurities(asOf),
      memberships:this.getIndexMembers("NIFTY50",asOf),
      prices:this.data.prices.filter(p=>p.timestamp<=asOf),
      corporateActions:this.data.corporateActions.filter(a=>a.exDate<=asOf.slice(0,10)),
      fundamentals:this.data.fundamentals.filter(f=>filingAvailableAt(f,this.fallbackLagDays)<=asOf)
    });
  }
}
