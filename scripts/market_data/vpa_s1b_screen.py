"""S1B VPA trough-reversal screen over local adjusted daily candles.

S1B evaluates a bullish reversal at, or within two bars after, the leg-two
trough. It intentionally has no leg-three expansion or peak-reclaim gate.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Tuple

import duckdb
import numpy as np
import pandas as pd

from vpa_three_leg_screen import (
    DEFAULT_PARQUET_ROOT,
    DEFAULT_REPORT_ROOT,
    _candidate_indexes,
    bullish_candle_patterns,
    calculate_wilder_rsi,
    load_local_symbols,
    read_adjusted_daily,
)


@dataclass(frozen=True)
class S1BPatternConfig:
    strategy_name: str = "S1B_VPA_TROUGH_REVERSAL"
    enforce_ath_discount: bool = True
    ath_min_discount_pct: float = 0.50
    enforce_sma_proximity: bool = True
    sma_period: int = 200
    sma_proximity_tolerance: float = 0.02
    total_lookback_bars: int = 35
    l1_end_target_offset: int = 20
    l1_end_tolerance: int = 4
    l2_end_target_offset: int = 0
    l2_end_tolerance: int = 2
    l1_min_bars: int = 1
    l1_max_bars: int = 10
    l2_min_bars: int = 2
    l2_max_bars: int = 20
    min_time_symmetry_ratio: float = 1.0
    l1_min_displacement_pct: float = 0.20
    l2_min_retrace_ratio: float = 0.10
    l2_max_retrace_ratio: float = 0.90
    require_higher_low: bool = True
    rsi_period: int = 14
    rsi_support_levels: Tuple[float, ...] = (30.0, 40.0, 50.0, 60.0)
    rsi_tolerance: float = 3.5
    vol_ma_period: int = 20
    vol_thrust_min_mult: float = 1.25
    vol_short_thrust_spike_mult: float = 1.80
    vol_pullback_max_ratio: float = 0.75
    vol_trough_dryup_mult: float = 0.80
    vol_trigger_min_mult: float = 1.25
    atr_period: int = 14
    trigger_min_range_atr: float = 0.75
    trigger_min_body_atr: float = 0.60
    exclude_doji: bool = True
    doji_max_body_ratio: float = 0.10
    require_bullish_candlestick: bool = True
    allow_marubozu: bool = True
    allow_hammer: bool = True
    allow_piercing: bool = True
    allow_harami: bool = True
    allow_engulfing: bool = True
    marubozu_min_body_ratio: float = 0.90
    marubozu_min_body_atr_multiple: float = 1.00
    hammer_min_lower_wick_ratio: float = 2.0
    hammer_max_upper_wick_ratio: float = 0.15
    piercing_min_penetration: float = 0.50
    harami_max_current_to_prior_body_ratio: float = 0.50
    harami_min_prior_body_ratio: float = 0.50
    cooldown_bars: int = 5
    forward_eval_bars: Tuple[int, ...] = (5, 10, 20)


def rsi_support(work: pd.DataFrame, signal_index: int, trough_index: int,
                config: S1BPatternConfig) -> tuple[str, float] | None:
    for index, label in ((signal_index, "SIGNAL"), (trough_index, "TROUGH")):
        value = float(work.at[index, "rsi"])
        if not np.isfinite(value):
            continue
        for level in config.rsi_support_levels:
            if abs(value - level) <= config.rsi_tolerance:
                return f"RSI_{level:g}_{label}", value
    return None


def detect_s1b(frame: pd.DataFrame, config: S1BPatternConfig) -> dict[str, Any] | None:
    minimum_history = max(config.total_lookback_bars, config.vol_ma_period,
                          config.rsi_period, config.sma_period)
    if len(frame) < minimum_history:
        return None
    prepared = frame.copy()
    prepared["vol_ma"] = prepared["volume"].rolling(config.vol_ma_period,
                                                       min_periods=config.vol_ma_period).mean()
    prepared["rsi"] = calculate_wilder_rsi(prepared["close"], config.rsi_period)
    prepared["sma"] = prepared["close"].rolling(config.sma_period,
                                                   min_periods=config.sma_period).mean()
    prior_close = prepared["close"].shift(1)
    prepared["true_range"] = pd.concat([
        prepared["high"] - prepared["low"],
        (prepared["high"] - prior_close).abs(),
        (prepared["low"] - prior_close).abs(),
    ], axis=1).max(axis=1)
    prepared["atr"] = prepared["true_range"].rolling(config.atr_period,
                                                       min_periods=config.atr_period).mean()
    prepared["ath"] = prepared["close"].cummax()
    work = prepared.tail(max(config.total_lookback_bars, config.vol_ma_period)).reset_index(drop=True)
    signal = len(work) - 1
    if not np.isfinite(work.at[signal, "vol_ma"]) or work.at[signal, "vol_ma"] <= 0:
        return None
    patterns = bullish_candle_patterns(work, signal, config)
    if config.require_bullish_candlestick and not patterns:
        return None
    trigger_range = float(work.at[signal, "high"] - work.at[signal, "low"])
    trigger_body = abs(float(work.at[signal, "close"] - work.at[signal, "open"]))
    trigger_atr = float(work.at[signal, "atr"])
    if (not np.isfinite(trigger_atr) or trigger_atr <= 0
            or trigger_range < config.trigger_min_range_atr * trigger_atr
            or trigger_body < config.trigger_min_body_atr * trigger_atr):
        return None
    trigger_volume_multiple = float(work.at[signal, "volume"]) / float(work.at[signal, "vol_ma"])
    if trigger_volume_multiple < config.vol_trigger_min_mult:
        return None
    ath = float(work.at[signal, "ath"])
    close = float(work.at[signal, "close"])
    ath_discount = 1 - close / ath if ath > 0 else 0.0
    sma = float(work.at[signal, "sma"])
    sma_distance = abs(close - sma) / sma if sma > 0 else float("inf")
    if ((config.enforce_ath_discount and ath_discount < config.ath_min_discount_pct)
            or (config.enforce_sma_proximity and sma_distance > config.sma_proximity_tolerance)):
        return None
    best: dict[str, Any] | None = None
    for peak in _candidate_indexes(signal, config.l1_end_target_offset, config.l1_end_tolerance):
        trough_oldest = max(0, signal - (config.l2_end_target_offset + config.l2_end_tolerance))
        trough_newest = min(signal, signal - (config.l2_end_target_offset - config.l2_end_tolerance))
        for trough in range(trough_oldest, trough_newest + 1):
            if trough <= peak:
                continue
            l2_bars = trough - peak
            if not config.l2_min_bars <= l2_bars <= config.l2_max_bars:
                continue
            for origin in range(max(0, peak - config.l1_max_bars), peak - config.l1_min_bars + 1):
                l1_bars = peak - origin
                if l1_bars <= 0 or l2_bars / l1_bars < config.min_time_symmetry_ratio:
                    continue
                origin_low = float(work.at[origin, "low"])
                peak_high = float(work.at[peak, "high"])
                trough_low = float(work.at[trough, "low"])
                if origin_low <= 0 or peak_high <= origin_low:
                    continue
                # A selected b remains the trough through the reversal signal.
                # This prevents an earlier low being mislabelled as b when a
                # later candle makes a lower low before the signal bar.
                if trough_low > float(work.loc[trough:signal, "low"].min()):
                    continue
                displacement = (peak_high - origin_low) / origin_low
                retracement = (peak_high - trough_low) / (peak_high - origin_low)
                if (displacement < config.l1_min_displacement_pct
                        or not config.l2_min_retrace_ratio <= retracement <= config.l2_max_retrace_ratio
                        or (config.require_higher_low and trough_low <= origin_low)):
                    continue
                l1 = work.iloc[origin:peak + 1]
                l2 = work.iloc[peak + 1:trough + 1]
                l1_volume = float(l1["volume"].mean())
                l2_volume = float(l2["volume"].mean())
                peak_vol_ma = float(work.at[peak, "vol_ma"])
                trough_multiple = float((l2["volume"] / work.loc[l2.index, "vol_ma"]).min())
                volume_ok = (l1_volume / peak_vol_ma >= config.vol_thrust_min_mult
                             and (l1_bars > 3 or float(l1["volume"].max()) / peak_vol_ma >= config.vol_short_thrust_spike_mult)
                             and l2_volume / l1_volume <= config.vol_pullback_max_ratio
                             and np.isfinite(trough_multiple) and trough_multiple <= config.vol_trough_dryup_mult)
                support = rsi_support(work, signal, trough, config)
                if not volume_ok or support is None:
                    continue
                score = displacement + l1_volume / peak_vol_ma + trigger_volume_multiple
                candidate = {
                    "strategy": config.strategy_name, "as_of_date": str(pd.Timestamp(work.at[signal, "trade_date"]).date()),
                    "origin_date": str(pd.Timestamp(work.at[origin, "trade_date"]).date()),
                    "leg1_high_date": str(pd.Timestamp(work.at[peak, "trade_date"]).date()),
                    "trough_date": str(pd.Timestamp(work.at[trough, "trade_date"]).date()),
                    "close": close, "leg1_high": peak_high, "trough_low": trough_low,
                    "l1_bars": l1_bars, "l2_bars": l2_bars, "displacement_pct": displacement,
                    "retracement_ratio": retracement, "leg1_volume_multiple": l1_volume / peak_vol_ma,
                    "leg2_to_leg1_volume_ratio": l2_volume / l1_volume, "trough_volume_multiple": trough_multiple,
                    "trigger_volume_multiple": trigger_volume_multiple, "candle_pattern": "|".join(patterns),
                    "trigger_range": trigger_range, "trigger_body": trigger_body, "atr14": trigger_atr,
                    "trigger_range_atr_multiple": trigger_range / trigger_atr,
                    "trigger_body_atr_multiple": trigger_body / trigger_atr,
                    "rsi_level": support[0], "rsi_value": support[1], "ath": ath,
                    "ath_discount_pct": ath_discount, "sma": sma, "sma_distance_pct": sma_distance,
                    "entry": close, "stop": trough_low, "score": score,
                }
                if best is None or candidate["score"] > best["score"]:
                    best = candidate
    return best


def scan_historical_signals(frame: pd.DataFrame, config: S1BPatternConfig,
                            trailing_bars: int | None = None) -> list[dict[str, Any]]:
    """Walk forward without lookahead and retain only post-signal returns."""
    first_index = max(config.total_lookback_bars, config.vol_ma_period,
                      config.rsi_period, config.sma_period)
    start_index = max(first_index, len(frame) - trailing_bars) if trailing_bars else first_index
    next_allowed = start_index
    records: list[dict[str, Any]] = []
    for signal_index in range(start_index, len(frame)):
        if signal_index < next_allowed:
            continue
        setup = detect_s1b(frame.iloc[:signal_index + 1], config)
        if setup is None:
            continue
        close = float(frame.iloc[signal_index]["close"])
        for horizon in config.forward_eval_bars:
            future_index = signal_index + horizon
            setup[f"forward_return_{horizon}b_pct"] = (
                (float(frame.iloc[future_index]["close"]) / close - 1) * 100
                if future_index < len(frame) else np.nan
            )
        records.append(setup)
        next_allowed = signal_index + config.cooldown_bars
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet-root", type=Path, default=DEFAULT_PARQUET_ROOT)
    parser.add_argument("--report-root", type=Path, default=DEFAULT_REPORT_ROOT)
    parser.add_argument("--as-of-date", required=True, help="ISO date used as the data cutoff.")
    parser.add_argument("--universe-name", default="s1b_all_local")
    parser.add_argument("--historical-bars", type=int, default=0,
                        help="Walk forward over this many latest trading bars; 0 evaluates only the latest bar.")
    args = parser.parse_args()
    config = S1BPatternConfig()
    symbols = load_local_symbols(args.parquet_root)
    con = duckdb.connect(":memory:")
    matches: list[dict[str, Any]] = []
    gaps: list[str] = []
    for symbol in symbols["symbol"]:
        daily = read_adjusted_daily(symbol, args.parquet_root, con)
        daily = daily.loc[daily["trade_date"].astype(str) <= args.as_of_date].reset_index(drop=True)
        if daily.empty:
            gaps.append(symbol)
            continue
        symbol_matches = (scan_historical_signals(daily, config, args.historical_bars)
                          if args.historical_bars else
                          [match] if (match := detect_s1b(daily, config)) else [])
        for match in symbol_matches:
            match["symbol"] = symbol
            match["Date_O"] = match["origin_date"]
            match["Date_a"] = match["leg1_high_date"]
            match["Signal_Date_b"] = match["as_of_date"]
            matches.append(match)
    con.close()
    matches.sort(key=lambda item: item["score"], reverse=True)
    report_root = args.report_root.resolve()
    report_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_name = "".join(c if c.isalnum() else "_" for c in args.universe_name.lower()).strip("_")
    evidence = {"strategy": "S1B", "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                "as_of_date_requested": args.as_of_date, "source": "KITE_ADJUSTED_PARQUET",
                "scan_mode": "ROLLING_WALK_FORWARD" if args.historical_bars else "LATEST_BAR",
                "historical_bars": args.historical_bars or None,
                "symbols_requested": int(len(symbols)), "symbols_covered": int(len(symbols) - len(gaps)),
                "coverage_gaps": gaps, "config": asdict(config), "matches": matches,
                "limitations": ["ATH is the maximum adjusted close within available local history, not a verified lifetime ATH.",
                                "A symbol may have an older final candle than the requested cutoff."]}
    json_path = report_root / f"s1b_{safe_name}_{stamp}.json"
    csv_path = report_root / f"s1b_{safe_name}_{stamp}.csv"
    json_path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    pd.DataFrame(matches).to_csv(csv_path, index=False)
    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "matches": len(matches),
                      "covered": evidence["symbols_covered"], "requested": evidence["symbols_requested"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
