import type { ResearchMetrics, TradeIdentityLedger } from "./types.js";

export interface EquityPoint {
  timestamp: string;
  equity: number;
}

export interface MetricOptions {
  initialCapital?: number;
  equity?: EquityPoint[];
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;

  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);

  return lo === hi
    ? a[lo]
    : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

export function bootstrapExpectancy(
  rMultiples: number[],
  iterations = 1000,
  seed = 42
) {
  if (!rMultiples.length) {
    return {
      lower: 0,
      median: 0,
      upper: 0,
      pPositive: 0,
      pAbove020: 0
    };
  }

  let state = seed >>> 0;

  const rand = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const means: number[] = [];

  for (let i = 0; i < iterations; i++) {
    let sum = 0;

    for (let j = 0; j < rMultiples.length; j++) {
      sum += rMultiples[Math.floor(rand() * rMultiples.length)];
    }

    means.push(sum / rMultiples.length);
  }

  return {
    lower: percentile(means, 0.025),
    median: percentile(means, 0.50),
    upper: percentile(means, 0.975),
    pPositive: means.filter(x => x > 0).length / means.length,
    pAbove020: means.filter(x => x > 0.20).length / means.length
  };
}

function buildTradeEquity(
  trades: TradeIdentityLedger[],
  initialCapital: number
): EquityPoint[] {
  const ordered = [...trades]
    .filter(t => Number.isFinite(t.netPnl))
    .sort((a, b) => a.exitTimestamp.localeCompare(b.exitTimestamp));

  let equity = initialCapital;

  return ordered.map(t => {
    equity += Number(t.netPnl ?? 0);

    return {
      timestamp: t.exitTimestamp,
      equity
    };
  });
}

function maxDrawdownPct(equity: EquityPoint[]): number {
  if (!equity.length) return 0;

  let peak = equity[0].equity;
  let maxDd = 0;

  for (const point of equity) {
    peak = Math.max(peak, point.equity);

    if (peak > 0) {
      const dd = ((peak - point.equity) / peak) * 100;
      maxDd = Math.max(maxDd, dd);
    }
  }

  return maxDd;
}

function annualizedReturn(
  equity: EquityPoint[],
  initialCapital: number
): number {
  if (equity.length < 2 || initialCapital <= 0) return 0;

  const start = new Date(equity[0].timestamp).getTime();
  const end = new Date(equity[equity.length - 1].timestamp).getTime();

  const years = Math.max(
    (end - start) / (365.25 * 24 * 60 * 60 * 1000),
    1 / 365.25
  );

  const ending = equity[equity.length - 1].equity;

  if (ending <= 0) return -1;

  return Math.pow(ending / initialCapital, 1 / years) - 1;
}

function dailyReturns(equity: EquityPoint[]): number[] {
  if (equity.length < 2) return [];

  const out: number[] = [];

  for (let i = 1; i < equity.length; i++) {
    const previous = equity[i - 1].equity;
    const current = equity[i].equity;

    if (previous > 0) {
      out.push(current / previous - 1);
    }
  }

  return out;
}

function sortinoRatio(equity: EquityPoint[]): number {
  const returns = dailyReturns(equity);

  if (!returns.length) return 0;

  const mean =
    returns.reduce((a, b) => a + b, 0) / returns.length;

  const downside = returns
    .filter(r => r < 0)
    .map(r => r * r);

  if (!downside.length) {
    return mean > 0 ? Infinity : 0;
  }

  const downsideDeviation =
    Math.sqrt(
      downside.reduce((a, b) => a + b, 0) / returns.length
    );

  if (downsideDeviation === 0) return 0;

  return (mean / downsideDeviation) * Math.sqrt(252);
}

export function calculateMetrics(
  trades: TradeIdentityLedger[],
  options: MetricOptions = {}
): ResearchMetrics {
  const initialCapital = options.initialCapital ?? 10_000_000;

  const rs = trades.map(t => Number(t.netRMultiple ?? 0));
  const pnls = trades.map(t => Number(t.netPnl ?? 0));

  const wins = pnls.filter(x => x > 0);
  const losses = pnls.filter(x => x < 0);

  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const equity =
    options.equity?.length
      ? [...options.equity].sort(
          (a, b) => a.timestamp.localeCompare(b.timestamp)
        )
      : buildTradeEquity(trades, initialCapital);

  const dd = maxDrawdownPct(equity);
  const cagr = annualizedReturn(equity, initialCapital);

  return {
    trades: trades.length,

    netPnl: pnls.reduce((a, b) => a + b, 0),

    expectancyR:
      rs.length
        ? rs.reduce((a, b) => a + b, 0) / rs.length
        : 0,

    profitFactor:
      grossLoss > 0
        ? grossWin / grossLoss
        : grossWin > 0
          ? Infinity
          : 0,

    maxDrawdownPct: Number(dd.toFixed(6)),

    calmar:
      dd > 0
        ? Number(((cagr * 100) / dd).toFixed(6))
        : 0,

    sortino: Number(sortinoRatio(equity).toFixed(6)),

    winRate:
      pnls.length
        ? wins.length / pnls.length
        : 0,

    meanMAE:
      trades.length
        ? trades.reduce(
            (a, t) => a + Number(t.mae ?? 0),
            0
          ) / trades.length
        : 0,

    meanMFE:
      trades.length
        ? trades.reduce(
            (a, t) => a + Number(t.mfe ?? 0),
            0
          ) / trades.length
        : 0
  };
}
