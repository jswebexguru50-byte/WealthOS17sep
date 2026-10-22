import type {
  ResearchBar,
  TradeIdentityLedger
} from "./types.js";

export type MarketRegime =
  | "BULLISH_EXPANSION"
  | "SIDEWAYS_CONSOLIDATION"
  | "BEARISH_CONTRACTION"
  | "UNCLASSIFIED";

export function classifyRegime(
  bars: ResearchBar[],
  asOf: string
): MarketRegime {
  const history =
    bars
      .filter(
        b =>
          b.timestamp <= asOf
      )
      .sort(
        (a, b) =>
          a.timestamp.localeCompare(
            b.timestamp
          )
      );

  if (history.length < 200) {
    return "UNCLASSIFIED";
  }

  const last = history[history.length - 1];

  const closes20 =
    history
      .slice(-20)
      .map(x => x.close);

  const closes200 =
    history
      .slice(-200)
      .map(x => x.close);

  const ma20 =
    closes20.reduce(
      (a, b) => a + b,
      0
    ) / closes20.length;

  const ma200 =
    closes200.reduce(
      (a, b) => a + b,
      0
    ) / closes200.length;

  const first200 =
    closes200[0];

  const trend =
    last.close / first200 - 1;

  const volatility =
    closes20.length > 1
      ? Math.sqrt(
          closes20
            .slice(1)
            .map(
              (x, i) =>
                Math.pow(
                  x /
                    closes20[i] -
                    1,
                  2
                )
            )
            .reduce(
              (a, b) => a + b,
              0
            ) /
            (closes20.length - 1)
        )
      : 0;

  if (
    last.close > ma200 &&
    ma20 > ma200 &&
    trend > 0.05
  ) {
    return "BULLISH_EXPANSION";
  }

  if (
    last.close < ma200 &&
    ma20 < ma200 &&
    trend < -0.05
  ) {
    return "BEARISH_CONTRACTION";
  }

  if (volatility < 0.03) {
    return "SIDEWAYS_CONSOLIDATION";
  }

  return "UNCLASSIFIED";
}

export function attributeTradeRegimes(
  trades: TradeIdentityLedger[],
  bars: ResearchBar[]
) {
  return trades.map(
    trade => ({
      ...trade,
      regime:
        classifyRegime(
          bars.filter(
            b =>
              b.symbol === trade.symbol
          ),
          trade.signalTimestamp
        )
    })
  );
}
