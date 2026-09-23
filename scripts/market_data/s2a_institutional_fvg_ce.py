"""S2A institutional Fair Value Gap / Consequent Encroachment backtester.

The detector is walk-forward: every setup is qualified only with OHLCV data
available on its signal bar. Forward returns are attached afterwards.
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

from vpa_three_leg_screen import DEFAULT_PARQUET_ROOT, DEFAULT_REPORT_ROOT, load_local_symbols, read_adjusted_daily


@dataclass(frozen=True)
class S2AConfig:
    strategy_id: str = "S2A"
    strategy_name: str = "S2_INSTITUTIONAL_FVG_CE"
    strategy_bucket: str = "Bucket B: Volume & Absorption"
    inflow_lookback_bars: int = 20
    inflow_vol_mult: float = 1.50
    fvg_min_size_pct: float = 0.015
    fvg_min_size_atr: float = 0.50
    atr_period: int = 14
    vol_ma_period: int = 20
    ce_midpoint_ratio: float = 0.50
    ce_touch_tolerance: float = 0.02
    ce_max_violation_ratio: float = 0.10
    pullback_max_bars: int = 15
    vol_pullback_max_mult: float = 0.75
    vol_trigger_min_mult: float = 1.00
    exclude_doji: bool = True
    doji_max_body_ratio: float = 0.10
    require_bullish_candlestick: bool = True
    allow_marubozu: bool = True
    allow_hammer: bool = True
    allow_piercing: bool = True
    allow_harami: bool = True
    allow_engulfing: bool = True
    marubozu_min_body_ratio: float = 0.90
    marubozu_min_atr_mult: float = 1.00
    hammer_min_lower_wick_ratio: float = 2.0
    hammer_max_upper_wick_ratio: float = 0.15
    piercing_min_penetration: float = 0.50
    cooldown_bars: int = 5
    forward_eval_bars: Tuple[int, ...] = (5, 10, 20)


def prepare_indicators(frame: pd.DataFrame, config: S2AConfig) -> pd.DataFrame:
    data = frame.copy().reset_index(drop=True)
    prior_close = data["close"].shift(1)
    data["true_range"] = pd.concat([
        data["high"] - data["low"],
        (data["high"] - prior_close).abs(),
        (data["low"] - prior_close).abs(),
    ], axis=1).max(axis=1)
    data["atr"] = data["true_range"].rolling(config.atr_period, min_periods=config.atr_period).mean()
    data["volume_sma"] = data["volume"].rolling(config.vol_ma_period, min_periods=config.vol_ma_period).mean()
    return data


def detect_candlestick_pattern(data: pd.DataFrame, index: int, config: S2AConfig) -> tuple[bool, str]:
    if index < 1:
        return False, "INSUFFICIENT_PRIOR_CANDLE"
    candle, prior = data.iloc[index], data.iloc[index - 1]
    opening, high, low, close = (float(candle[key]) for key in ("open", "high", "low", "close"))
    candle_range, body = high - low, abs(close - opening)
    if candle_range <= 0 or body <= 0 or (config.exclude_doji and body / candle_range <= config.doji_max_body_ratio):
        return False, "DOJI_OR_ZERO_RANGE"
    if close <= opening:
        return False, "NOT_BULLISH"
    atr = float(candle["atr"])
    upper_wick, lower_wick = high - max(opening, close), min(opening, close) - low
    prior_open, prior_close, prior_low = (float(prior[key]) for key in ("open", "close", "low"))
    if (config.allow_marubozu and body / candle_range >= config.marubozu_min_body_ratio
            and np.isfinite(atr) and close - opening >= config.marubozu_min_atr_mult * atr):
        return True, "MARUBOZU"
    if (config.allow_hammer and lower_wick / body >= config.hammer_min_lower_wick_ratio
            and upper_wick / candle_range <= config.hammer_max_upper_wick_ratio):
        return True, "HAMMER"
    if (config.allow_engulfing and prior_close < prior_open and opening <= prior_close and close >= prior_open):
        return True, "ENGULFING"
    prior_body = abs(prior_close - prior_open)
    if (config.allow_piercing and prior_close < prior_open and opening <= min(prior_low, prior_close)
            and close >= prior_close + config.piercing_min_penetration * prior_body):
        return True, "PIERCING"
    if config.allow_harami and prior_close < prior_open and opening > prior_close and close < prior_open:
        return True, "HARAMI"
    return False, "NO_BULLISH_REVERSAL_PATTERN"


def detect_s2a_at(data: pd.DataFrame, signal: int, config: S2AConfig) -> dict[str, Any] | None:
    if signal < max(config.atr_period, config.vol_ma_period, 3):
        return None
    trigger_volume_ratio = float(data.at[signal, "volume"] / data.at[signal, "volume_sma"])
    if not np.isfinite(trigger_volume_ratio) or trigger_volume_ratio < config.vol_trigger_min_mult:
        return None
    valid_candle, pattern = detect_candlestick_pattern(data, signal, config)
    if config.require_bullish_candlestick and not valid_candle:
        return None
    first_gap_bar = max(2, signal - config.pullback_max_bars)
    candidates: list[dict[str, Any]] = []
    for gap_bar in range(first_gap_bar, signal):
        displacement = gap_bar - 1
        fvg_floor = float(data.at[gap_bar - 2, "high"])
        fvg_ceiling = float(data.at[gap_bar, "low"])
        gap_height = fvg_ceiling - fvg_floor
        atr = float(data.at[gap_bar, "atr"])
        displacement_volume_ratio = float(data.at[displacement, "volume"] / data.at[displacement, "volume_sma"])
        if (gap_height <= 0 or not np.isfinite(atr) or not np.isfinite(displacement_volume_ratio)
                or displacement_volume_ratio < config.inflow_vol_mult
                or not (gap_height >= config.fvg_min_size_pct * fvg_floor or gap_height >= config.fvg_min_size_atr * atr)):
            continue
        ce_level = fvg_floor + config.ce_midpoint_ratio * gap_height
        trigger_low, trigger_close = float(data.at[signal, "low"]), float(data.at[signal, "close"])
        if abs(trigger_low - ce_level) / ce_level > config.ce_touch_tolerance:
            continue
        if trigger_close < fvg_floor * (1 - config.ce_max_violation_ratio):
            continue
        pullback = data.iloc[gap_bar + 1:signal + 1]
        pullback_volume = float(pullback["volume"].mean())
        displacement_volume = float(data.at[displacement, "volume"])
        if pullback_volume > config.vol_pullback_max_mult * displacement_volume:
            continue
        candidates.append({
            "Signal_Date": str(pd.Timestamp(data.at[signal, "trade_date"]).date()),
            "Strategy_ID": config.strategy_id, "Strategy_Name": config.strategy_name,
            "Candle_Pattern": pattern,
            "FVG_Displacement_Date": str(pd.Timestamp(data.at[displacement, "trade_date"]).date()),
            "FVG_Low_Bound": fvg_floor, "FVG_High_Bound": fvg_ceiling, "CE_Level": ce_level,
            "Signal_Price": trigger_close, "FVG_Size_Pct": 100 * gap_height / fvg_floor,
            "Pullback_Duration_Bars": signal - gap_bar,
            "Trigger_Vol_Ratio": trigger_volume_ratio,
            "Displacement_Vol_Ratio": displacement_volume_ratio,
            "Pullback_Vol_Ratio": pullback_volume / displacement_volume,
            "Score": gap_height / atr + displacement_volume_ratio + trigger_volume_ratio,
        })
    return max(candidates, key=lambda item: item["Score"], default=None)


def walk_forward_backtest(frame: pd.DataFrame, config: S2AConfig) -> pd.DataFrame:
    data = prepare_indicators(frame, config)
    records: list[dict[str, Any]] = []
    next_allowed = max(config.atr_period, config.vol_ma_period, 3)
    for signal in range(next_allowed, len(data)):
        if signal < next_allowed:
            continue
        setup = detect_s2a_at(data.iloc[:signal + 1].reset_index(drop=True), signal, config)
        if setup is None:
            continue
        price = float(data.at[signal, "close"])
        for horizon in config.forward_eval_bars:
            future = signal + horizon
            setup[f"Fwd_Return_{horizon}B (%)"] = ((float(data.at[future, "close"]) / price - 1) * 100
                                                     if future < len(data) else np.nan)
        records.append(setup)
        next_allowed = signal + config.cooldown_bars
    return pd.DataFrame(records)


def synthetic_ohlcv() -> pd.DataFrame:
    """Deterministic data containing a valid S2A CE reaction for verification."""
    dates = pd.bdate_range("2025-01-01", periods=55)
    frame = pd.DataFrame({"trade_date": dates, "open": 100.0, "high": 101.0, "low": 99.0,
                          "close": 100.5, "volume": 1_000.0})
    # FVG: high[37]=101, displacement volume at 38, low[39]=105 creates a 4-point gap.
    frame.loc[37, ["open", "high", "low", "close", "volume"]] = [100, 101, 99, 100, 1000]
    frame.loc[38, ["open", "high", "low", "close", "volume"]] = [101, 106, 100, 105, 2500]
    frame.loc[39, ["open", "high", "low", "close", "volume"]] = [105, 107, 105, 106, 1200]
    # CE is 103; signal at 41 is a large bullish Marubozu touching CE.
    frame.loc[40, ["open", "high", "low", "close", "volume"]] = [105, 105, 103.2, 103.5, 900]
    frame.loc[41, ["open", "high", "low", "close", "volume"]] = [102.9, 106.0, 102.8, 105.9, 1800]
    return frame


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all-local-symbols", action="store_true")
    parser.add_argument("--as-of-date")
    parser.add_argument("--parquet-root", type=Path, default=DEFAULT_PARQUET_ROOT)
    parser.add_argument("--report-root", type=Path, default=DEFAULT_REPORT_ROOT)
    parser.add_argument("--universe-name", default="s2a_all_local")
    parser.add_argument("--verify-synthetic", action="store_true")
    args = parser.parse_args()
    config = S2AConfig()
    if args.verify_synthetic:
        results = walk_forward_backtest(synthetic_ohlcv(), config)
        if results.empty:
            raise RuntimeError("Synthetic S2A verification did not produce a trigger.")
        print(results.to_csv(index=False))
        return 0
    if not args.all_local_symbols or not args.as_of_date:
        parser.error("--all-local-symbols and --as-of-date are required unless --verify-synthetic is used.")
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
        data = prepare_indicators(daily, config)
        setup = detect_s2a_at(data, len(data) - 1, config)
        if setup:
            setup["Symbol"] = symbol
            matches.append(setup)
    con.close()
    matches.sort(key=lambda item: item["Score"], reverse=True)
    root = args.report_root.resolve(); root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = "".join(c if c.isalnum() else "_" for c in args.universe_name.lower()).strip("_")
    evidence = {"strategy": "S2A", "generated_at_utc": datetime.now(timezone.utc).isoformat(),
                "as_of_date_requested": args.as_of_date, "source": "KITE_ADJUSTED_PARQUET",
                "symbols_requested": int(len(symbols)), "symbols_covered": int(len(symbols) - len(gaps)),
                "coverage_gaps": gaps, "config": asdict(config), "matches": matches,
                "limitations": ["S2A deliberately has no ATH, SMA, or RSI filters.",
                                "A symbol may have an older final candle than the requested cutoff."]}
    json_path, csv_path = root / f"s2a_{name}_{stamp}.json", root / f"s2a_{name}_{stamp}.csv"
    json_path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    pd.DataFrame(matches).to_csv(csv_path, index=False)
    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "matches": len(matches),
                      "covered": evidence["symbols_covered"], "requested": evidence["symbols_requested"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
