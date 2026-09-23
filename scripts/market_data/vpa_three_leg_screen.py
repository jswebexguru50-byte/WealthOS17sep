"""Parameter-driven daily VPA three-leg screen over adjusted Kite Parquet candles.

The program deliberately has no dependency on application/LLM services.  It
downloads the current official Nifty 50 constituent list (unless a snapshot is
supplied), scans only the local corporate-action-adjusted daily candle store,
and writes both a reproducible constituent snapshot and detailed evidence.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Tuple

import duckdb
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class VPAPatternConfig:
    # Macro & Trend Regime Filters
    enforce_ath_discount: bool = True
    ath_min_discount_pct: float = 0.50
    enforce_sma_proximity: bool = True
    sma_period: int = 200
    sma_proximity_tolerance: float = 0.02
    sma_check_location: str = "signal_bar"

    # Time Window & Anchor Offsets (relative to current bar index: -1)
    total_lookback_bars: int = 35
    l1_end_target_offset: int = 25
    l1_end_tolerance: int = 3
    l2_end_target_offset: int = 5
    l2_end_tolerance: int = 2

    # Duration Bounds (in bars)
    l1_min_bars: int = 1
    l1_max_bars: int = 10
    l2_min_bars: int = 2
    l2_max_bars: int = 20
    min_time_symmetry_ratio: float = 1.0

    # Price Movement Thresholds
    l1_min_displacement_pct: float = 0.20
    l3_min_reclaim_ratio: float = 0.80

    # Scenario A: standard retracement and mean-reversion RSI support
    l2_standard_min_retrace: float = 0.10
    l2_standard_max_retrace: float = 0.50
    standard_rsi_levels: Tuple[float, ...] = (30.0, 40.0, 50.0)
    standard_rsi_tolerance: float = 3.5

    # Scenario B: ultra-shallow, high-momentum alternative
    enable_rsi60_momentum_scenario: bool = True
    rsi60_momentum_level: float = 60.0
    rsi60_tolerance: float = 2.0
    l2_rsi60_max_retrace: float = 0.50

    # Volume Price Alignment Thresholds
    vol_ma_period: int = 20
    vol_thrust_min_mult: float = 1.25
    vol_short_thrust_spike_mult: float = 1.80
    vol_pullback_max_ratio: float = 0.75
    vol_trough_dryup_mult: float = 0.80
    vol_reclaim_min_mult: float = 1.00

    # Kept configurable so no duration is embedded in the detector.
    short_thrust_max_bars: int = 3

    # RSI Support Parameters
    rsi_period: int = 14
    atr_period: int = 14
    rsi_check_location: str = "signal_or_trough"

    # Trigger-candle Confirmation (signal candle c)
    require_bullish_candlestick: bool = True
    allow_marubozu: bool = True
    allow_hammer: bool = True
    allow_piercing: bool = True
    allow_harami: bool = True
    allow_engulfing: bool = True
    exclude_doji: bool = True
    doji_max_body_ratio: float = 0.10
    marubozu_min_body_ratio: float = 0.90
    marubozu_min_body_atr_multiple: float = 1.00
    hammer_min_lower_wick_ratio: float = 2.0
    hammer_max_upper_wick_ratio: float = 0.15
    piercing_min_penetration: float = 0.50
    harami_max_current_to_prior_body_ratio: float = 0.50
    harami_min_prior_body_ratio: float = 0.50

    # Retained in the configuration for walk-forward/backtest callers.
    cooldown_bars: int = 5
    forward_eval_bars: Tuple[int, ...] = (5, 10, 20)


@dataclass(frozen=True)
class VPATradePlanConfig:
    """Presentation-only plan; pattern qualification never relies on these values."""
    entry_breakout_buffer_pct: float = 0.00
    stop_below_pullback_pct: float = 0.00
    target_one_reward_to_risk: float = 2.0
    target_two_reward_to_risk: float = 3.0
    strategy_name: str = "S1A_VPA_3_LEG_RECLAIM"


DEFAULT_CONSTITUENTS_URL = "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"
DEFAULT_PARQUET_ROOT = Path("data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles")
DEFAULT_REPORT_ROOT = Path("reports/readiness/vpa_three_leg")


def load_constituents(url: str | None, file_path: Path | None) -> pd.DataFrame:
    """Return the official constituent table; callers may pin a saved CSV."""
    if file_path:
        frame = pd.read_csv(file_path)
    else:
        request = urllib.request.Request(url or DEFAULT_CONSTITUENTS_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            frame = pd.read_csv(io.BytesIO(response.read()))
    symbol_column = next((column for column in frame.columns if column.strip().lower() == "symbol"), None)
    if symbol_column is None:
        raise ValueError("Constituent file has no Symbol column")
    result = frame.copy()
    result["symbol"] = result[symbol_column].astype(str).str.strip().str.upper()
    return result.loc[result["symbol"].ne("")].drop_duplicates("symbol").reset_index(drop=True)


def load_plain_symbols(file_path: Path) -> pd.DataFrame:
    """Load a pasted one-symbol-per-line universe, preserving the audit order."""
    symbols = [line.strip().upper() for line in file_path.read_text(encoding="utf-8").splitlines()]
    return pd.DataFrame({"symbol": symbols}).loc[lambda frame: frame["symbol"].ne("")].drop_duplicates("symbol").reset_index(drop=True)


def load_local_symbols(root: Path) -> pd.DataFrame:
    """Discover every locally persisted adjusted-candle partition."""
    symbols = [partition.name.removeprefix("symbol=").upper() for partition in root.glob("symbol=*")
               if (partition / "part-0.parquet").exists()]
    return pd.DataFrame({"symbol": sorted(set(symbols))})


def read_adjusted_daily(symbol: str, root: Path, con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    parquet_path = root / f"symbol={symbol}" / "part-0.parquet"
    if not parquet_path.exists():
        return pd.DataFrame()
    escaped_path = str(parquet_path.resolve()).replace("\\", "/").replace("'", "''")
    return con.execute(
            f"""
            SELECT trade_date, open_adjusted AS open, high_adjusted AS high,
                   low_adjusted AS low, close_adjusted AS close,
                   volume_raw AS volume
            FROM read_parquet('{escaped_path}')
            WHERE open_adjusted IS NOT NULL AND high_adjusted IS NOT NULL
              AND low_adjusted IS NOT NULL AND close_adjusted IS NOT NULL
              AND volume_raw IS NOT NULL
            ORDER BY trade_date ASC
            """
    ).df()


def _candidate_indexes(current: int, offset: int, tolerance: int) -> range:
    oldest = max(0, current - (offset + tolerance))
    newest = max(0, current - (offset - tolerance))
    return range(oldest, newest + 1)


def calculate_wilder_rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gains = delta.clip(lower=0)
    losses = -delta.clip(upper=0)
    average_gain = gains.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    average_loss = losses.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    relative_strength = average_gain / average_loss.replace(0, np.nan)
    return 100 - (100 / (1 + relative_strength))


def bullish_candle_patterns(work: pd.DataFrame, index: int, config: VPAPatternConfig) -> list[str]:
    if index < 1:
        return []
    candle = work.iloc[index]
    prior = work.iloc[index - 1]
    opening, high, low, closing = (float(candle[key]) for key in ("open", "high", "low", "close"))
    prior_open, prior_close, prior_low = (float(prior[key]) for key in ("open", "close", "low"))
    candle_range = high - low
    body = abs(closing - opening)
    if candle_range <= 0 or body <= 0:
        return []
    if config.exclude_doji and body / candle_range <= config.doji_max_body_ratio:
        return []
    lower_wick = min(opening, closing) - low
    upper_wick = high - max(opening, closing)
    bullish = closing > opening
    atr_value = float(work.at[index, "atr"]) if "atr" in work.columns else float("nan")
    patterns: list[str] = []
    if (config.allow_marubozu and bullish
            and body / candle_range >= config.marubozu_min_body_ratio
            and np.isfinite(atr_value)
            and (closing - opening) >= config.marubozu_min_body_atr_multiple * atr_value):
        patterns.append("BULLISH_MARUBOZU")
    if (config.allow_hammer and bullish and lower_wick / body >= config.hammer_min_lower_wick_ratio
            and upper_wick / candle_range <= config.hammer_max_upper_wick_ratio):
        patterns.append("BULLISH_HAMMER")
    prior_body = abs(prior_close - prior_open)
    prior_range = float(prior["high"]) - float(prior["low"])
    if (config.allow_piercing and prior_close < prior_open and bullish
            and opening <= min(prior_low, prior_close)
            and closing >= prior_close + prior_body * config.piercing_min_penetration):
        patterns.append("BULLISH_PIERCING")
    if (config.allow_harami and prior_close < prior_open and bullish and prior_body > 0
            and prior_range > 0 and prior_body / prior_range >= config.harami_min_prior_body_ratio
            and body / prior_body <= config.harami_max_current_to_prior_body_ratio
            and opening >= prior_close and closing <= prior_open):
        patterns.append("BULLISH_HARAMI")
    if (config.allow_engulfing and prior_close < prior_open and bullish
            and opening <= prior_close and closing >= prior_open):
        patterns.append("BULLISH_ENGULFING")
    return patterns


def standard_rsi_support_match(work: pd.DataFrame, signal_index: int, trough_index: int,
                               config: VPAPatternConfig) -> tuple[str, float] | None:
    locations = {"signal_bar": [signal_index], "trough_bar": [trough_index],
                 "signal_or_trough": [signal_index, trough_index]}
    if config.rsi_check_location not in locations:
        raise ValueError("rsi_check_location must be signal_bar, trough_bar, or signal_or_trough")
    for index in locations[config.rsi_check_location]:
        value = float(work.at[index, "rsi"])
        if not np.isfinite(value):
            continue
        for level in config.standard_rsi_levels:
            if abs(value - level) <= config.standard_rsi_tolerance:
                location_name = "SIGNAL" if index == signal_index else "TROUGH"
                return f"RSI_{level:g}_{location_name}", value
    return None


def rsi60_momentum_match(work: pd.DataFrame, trough_index: int,
                         config: VPAPatternConfig) -> tuple[str, float] | None:
    """Scenario B is deliberately anchored at the pullback trough/start of leg 3."""
    value = float(work.at[trough_index, "rsi"])
    threshold = config.rsi60_momentum_level - config.rsi60_tolerance
    if config.enable_rsi60_momentum_scenario and np.isfinite(value) and value >= threshold:
        return "RSI60_TROUGH", value
    return None


def sma_proximity_match(work: pd.DataFrame, signal_index: int, trough_index: int,
                        config: VPAPatternConfig) -> tuple[str, float] | None:
    locations = {"signal_bar": [(signal_index, "close", "SMA_SIGNAL")],
                 "trough_bar": [(trough_index, "low", "SMA_TROUGH")],
                 "either": [(signal_index, "close", "SMA_SIGNAL"),
                            (trough_index, "low", "SMA_TROUGH")]}
    if config.sma_check_location not in locations:
        raise ValueError("sma_check_location must be signal_bar, trough_bar, or either")
    for index, field, label in locations[config.sma_check_location]:
        average = float(work.at[index, "sma"])
        price = float(work.at[index, field])
        if np.isfinite(average) and average > 0:
            distance = abs(price - average) / average
            if distance <= config.sma_proximity_tolerance:
                return label, distance
    return None


def detect_vpa_three_leg(frame: pd.DataFrame, config: VPAPatternConfig,
                         plan: VPATradePlanConfig) -> dict[str, Any] | None:
    """Find the best fully confirmed VPA structure ending at the final bar.

    O is the low at the start of leg 1, a is the leg-1 high, b is the leg-2
    low and c is the current/reclaim close.  All candidate spans and limits are
    derived from ``config``; no pattern threshold is embedded in this routine.
    """
    minimum_history = max(config.total_lookback_bars, config.vol_ma_period, config.rsi_period, config.sma_period)
    if len(frame) < minimum_history:
        return None
    # Calculate the volume reference before taking the pattern window.  This
    # retains a complete SMA for an anchor that sits early in the last window.
    prepared = frame.copy()
    prepared["vol_ma"] = prepared["volume"].rolling(
        config.vol_ma_period, min_periods=config.vol_ma_period
    ).mean()
    prepared["rsi"] = calculate_wilder_rsi(prepared["close"], config.rsi_period)
    prepared["sma"] = prepared["close"].rolling(config.sma_period, min_periods=config.sma_period).mean()
    prior_close = prepared["close"].shift(1)
    prepared["true_range"] = pd.concat([
        prepared["high"] - prepared["low"],
        (prepared["high"] - prior_close).abs(),
        (prepared["low"] - prior_close).abs(),
    ], axis=1).max(axis=1)
    prepared["atr"] = prepared["true_range"].rolling(config.atr_period,
                                                       min_periods=config.atr_period).mean()
    prepared["ath"] = prepared["close"].cummax()
    work = prepared.tail(maximum_history := max(config.total_lookback_bars, config.vol_ma_period)).reset_index(drop=True)
    c = len(work) - 1
    if not np.isfinite(work.at[c, "vol_ma"]) or work.at[c, "vol_ma"] <= 0:
        return None
    candle_patterns = bullish_candle_patterns(work, c, config)
    if config.require_bullish_candlestick and not candle_patterns:
        return None

    best: dict[str, Any] | None = None
    for a in _candidate_indexes(c, config.l1_end_target_offset, config.l1_end_tolerance):
        for b in _candidate_indexes(c, config.l2_end_target_offset, config.l2_end_tolerance):
            if b <= a:
                continue
            l2_bars = b - a
            if not config.l2_min_bars <= l2_bars <= config.l2_max_bars:
                continue
            for origin in range(max(0, a - config.l1_max_bars), a - config.l1_min_bars + 1):
                l1_bars = a - origin
                if l1_bars <= 0 or l2_bars / l1_bars < config.min_time_symmetry_ratio:
                    continue
                base_low = float(work.at[origin, "low"])
                leg1_high = float(work.at[a, "high"])
                pullback_low = float(work.at[b, "low"])
                if base_low <= 0 or leg1_high <= base_low:
                    continue
                displacement = (leg1_high - base_low) / base_low
                retracement = (leg1_high - pullback_low) / (leg1_high - base_low)
                reclaim = float(work.at[c, "close"]) / leg1_high
                l1 = work.iloc[origin : a + 1]
                l2 = work.iloc[a + 1 : b + 1]
                l1_volume = float(l1["volume"].mean())
                l2_volume = float(l2["volume"].mean())
                leg1_vol_ma = float(work.at[a, "vol_ma"])
                trough_ratio = float((l2["volume"] / work.loc[l2.index, "vol_ma"]).min())
                volume_checks = {
                    "leg1_thrust": l1_volume / leg1_vol_ma >= config.vol_thrust_min_mult,
                    "short_leg_spike": (l1_bars > config.short_thrust_max_bars or
                                       float(l1["volume"].max()) / leg1_vol_ma >= config.vol_short_thrust_spike_mult),
                    "pullback_contraction": l2_volume / l1_volume <= config.vol_pullback_max_ratio,
                    "pullback_dryup": np.isfinite(trough_ratio) and trough_ratio <= config.vol_trough_dryup_mult,
                    "reclaim_volume": float(work.at[c, "volume"]) / float(work.at[c, "vol_ma"]) >= config.vol_reclaim_min_mult,
                }
                price_checks = {
                    "displacement": displacement >= config.l1_min_displacement_pct,
                    "reclaim": reclaim >= config.l3_min_reclaim_ratio,
                }
                standard_rsi = standard_rsi_support_match(work, c, b, config)
                rsi60 = rsi60_momentum_match(work, b, config)
                scenario_a = (config.l2_standard_min_retrace <= retracement <= config.l2_standard_max_retrace
                              and standard_rsi is not None)
                scenario_b = (retracement < config.l2_rsi60_max_retrace and rsi60 is not None)
                if not (scenario_a or scenario_b):
                    continue
                scenario_name = "SCENARIO_A_STANDARD" if scenario_a else "SCENARIO_B_RSI60_MOMENTUM"
                rsi_match = standard_rsi if scenario_a else rsi60
                ath_discount = 1 - float(work.at[c, "close"]) / float(work.at[c, "ath"])
                ath_check = (not config.enforce_ath_discount or ath_discount >= config.ath_min_discount_pct)
                sma_match = sma_proximity_match(work, c, b, config)
                sma_check = not config.enforce_sma_proximity or sma_match is not None
                if (not all(price_checks.values()) or not all(volume_checks.values())
                        or not ath_check or not sma_check):
                    continue
                entry = leg1_high * (1 + plan.entry_breakout_buffer_pct)
                stop = pullback_low * (1 - plan.stop_below_pullback_pct)
                unit_risk = entry - stop
                if unit_risk <= 0:
                    continue
                target_one = entry + unit_risk * plan.target_one_reward_to_risk
                target_two = entry + unit_risk * plan.target_two_reward_to_risk
                candidate = {
                    "as_of_date": str(pd.Timestamp(work.at[c, "trade_date"]).date()),
                    "origin_date": str(pd.Timestamp(work.at[origin, "trade_date"]).date()),
                    "leg1_high_date": str(pd.Timestamp(work.at[a, "trade_date"]).date()),
                    "leg2_low_date": str(pd.Timestamp(work.at[b, "trade_date"]).date()),
                    "close": float(work.at[c, "close"]), "leg1_high": leg1_high,
                    "l1_bars": l1_bars, "l2_bars": l2_bars,
                    "displacement_pct": displacement, "retracement_ratio": retracement,
                    "reclaim_ratio": reclaim, "leg1_volume_multiple": l1_volume / leg1_vol_ma,
                    "leg2_to_leg1_volume_ratio": l2_volume / l1_volume,
                    "trough_volume_multiple": trough_ratio,
                    "reclaim_volume_multiple": float(work.at[c, "volume"]) / float(work.at[c, "vol_ma"]),
                    "strategy": plan.strategy_name,
                    "candle_pattern": "|".join(candle_patterns) if candle_patterns else "NOT_REQUIRED",
                    "rsi_level": rsi_match[0], "rsi_value": rsi_match[1],
                    "scenario": scenario_name,
                    "ath": float(work.at[c, "ath"]), "ath_discount_pct": ath_discount,
                    "sma": float(work.at[c, "sma"]),
                    "sma_match_location": sma_match[0] if sma_match else "NOT_ENFORCED",
                    "sma_distance_pct": sma_match[1] if sma_match else np.nan,
                    "cmp": float(work.at[c, "close"]), "entry": entry, "stop": stop,
                    "target_1": target_one, "target_2": target_two,
                    "rr_target_1": plan.target_one_reward_to_risk,
                    "score": displacement + reclaim + (l1_volume / leg1_vol_ma),
                    "price_checks": price_checks, "volume_checks": volume_checks,
                }
                if best is None or candidate["score"] > best["score"]:
                    best = candidate
    return best


def scan_historical_signals(frame: pd.DataFrame, config: VPAPatternConfig,
                            plan: VPATradePlanConfig, trailing_bars: int | None = None) -> list[dict[str, Any]]:
    """Walk forward without lookahead and attach only post-signal returns.

    Each detector invocation sees rows through its evaluation bar only.  Future
    returns are added afterwards for evaluation, never for qualification.
    """
    first_index = max(config.total_lookback_bars, config.vol_ma_period,
                      config.rsi_period, config.sma_period)
    results: list[dict[str, Any]] = []
    next_allowed_index = first_index
    start_index = max(first_index, len(frame) - trailing_bars) if trailing_bars else first_index
    next_allowed_index = start_index
    for current_index in range(start_index, len(frame)):
        if current_index < next_allowed_index:
            continue
        signal = detect_vpa_three_leg(frame.iloc[:current_index + 1], config, plan)
        if signal is None:
            continue
        signal["signal_date"] = signal["as_of_date"]
        signal["date_o"] = signal["origin_date"]
        signal["date_a"] = signal["leg1_high_date"]
        signal["date_b"] = signal["leg2_low_date"]
        signal_price = float(signal["cmp"])
        for horizon in config.forward_eval_bars:
            future_index = current_index + horizon
            signal[f"forward_return_{horizon}b_pct"] = (
                (float(frame.iloc[future_index]["close"]) / signal_price - 1) * 100
                if future_index < len(frame) else np.nan
            )
        results.append(signal)
        next_allowed_index = current_index + config.cooldown_bars
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet-root", type=Path, default=DEFAULT_PARQUET_ROOT)
    parser.add_argument("--report-root", type=Path, default=DEFAULT_REPORT_ROOT)
    parser.add_argument("--constituents-url", default=DEFAULT_CONSTITUENTS_URL)
    parser.add_argument("--constituents-file", type=Path)
    parser.add_argument("--symbols-file", type=Path, help="Plain pasted list: one exchange symbol per line")
    parser.add_argument("--all-local-symbols", action="store_true", help="Scan every local adjusted-candle partition")
    parser.add_argument("--universe-name", default="nifty50", help="Audit label used in output filenames")
    parser.add_argument("--historical-bars", type=int, default=0,
                        help="Walk forward over this many latest trading bars; 0 evaluates only the latest bar")
    parser.add_argument("--as-of-date", type=str,
                        help="Evaluate each symbol only through this ISO date (YYYY-MM-DD).")
    arguments = parser.parse_args()
    config = VPAPatternConfig()
    plan = VPATradePlanConfig()
    report_root = arguments.report_root.resolve()
    report_root.mkdir(parents=True, exist_ok=True)
    if arguments.all_local_symbols:
        constituents = load_local_symbols(arguments.parquet_root)
    elif arguments.symbols_file:
        constituents = load_plain_symbols(arguments.symbols_file)
    else:
        constituents = load_constituents(arguments.constituents_url, arguments.constituents_file)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    universe_name = "".join(character if character.isalnum() else "_" for character in arguments.universe_name.lower()).strip("_")
    snapshot_path = report_root / f"{universe_name}_constituents_{timestamp}.csv"
    constituents.to_csv(snapshot_path, index=False)

    matches: list[dict[str, Any]] = []
    coverage_gaps: list[str] = []
    con = duckdb.connect(":memory:")
    for symbol in constituents["symbol"]:
        daily = read_adjusted_daily(symbol, arguments.parquet_root, con)
        if arguments.as_of_date:
            daily = daily.loc[daily["trade_date"].astype(str) <= arguments.as_of_date].reset_index(drop=True)
        if daily.empty:
            coverage_gaps.append(symbol)
            continue
        symbol_matches = (scan_historical_signals(daily, config, plan, arguments.historical_bars)
                          if arguments.historical_bars else
                          [match] if (match := detect_vpa_three_leg(daily, config, plan)) else [])
        for match in symbol_matches:
            match["symbol"] = symbol
            match["rule_checks_and_measured_values"] = (
                f"Leg 1 impulse: {match['displacement_pct']:.2%} (min {config.l1_min_displacement_pct:.2%}) | PASS\n"
                f"Leg 1 duration: {match['l1_bars']} bars ({config.l1_min_bars}-{config.l1_max_bars}) | PASS\n"
                f"Leg 2 retracement: {match['retracement_ratio']:.2%} | {match['scenario']} | PASS\n"
                f"Leg 2 duration: {match['l2_bars']} bars ({config.l2_min_bars}-{config.l2_max_bars}) | PASS\n"
                f"Reclaim: {match['reclaim_ratio']:.2%} of leg-1 high (min {config.l3_min_reclaim_ratio:.2%}) | PASS\n"
                f"Leg-1 volume: {match['leg1_volume_multiple']:.2f}x SMA{config.vol_ma_period} "
                f"(min {config.vol_thrust_min_mult:.2f}x) | PASS\n"
                f"Pullback / leg-1 volume: {match['leg2_to_leg1_volume_ratio']:.2f}x "
                f"(max {config.vol_pullback_max_ratio:.2f}x) | PASS\n"
                f"Pullback trough volume: {match['trough_volume_multiple']:.2f}x SMA{config.vol_ma_period} "
                f"(max {config.vol_trough_dryup_mult:.2f}x) | PASS\n"
                f"Reclaim volume: {match['reclaim_volume_multiple']:.2f}x SMA{config.vol_ma_period} "
                f"(min {config.vol_reclaim_min_mult:.2f}x) | PASS\n"
                f"Bullish trigger candle: {match['candle_pattern']} | PASS\n"
                f"RSI branch: {match['rsi_level']} at {match['rsi_value']:.2f} | PASS\n"
                f"ATH discount: {match['ath_discount_pct']:.2%} from ₹{match['ath']:.2f} "
                f"(min {config.ath_min_discount_pct:.2%}) | PASS\n"
                f"{match['sma_match_location']}: {match['sma_distance_pct']:.2%} from SMA{config.sma_period} "
                f"(max {config.sma_proximity_tolerance:.2%}) | PASS\n"
                f"Plan: entry is leg-1 breakout ₹{match['entry']:.2f}; stop is leg-2 low ₹{match['stop']:.2f}; "
                f"targets are {plan.target_one_reward_to_risk:.1f}R / {plan.target_two_reward_to_risk:.1f}R."
            )
            matches.append(match)
    con.close()
    matches.sort(key=lambda item: item["score"], reverse=True)
    evidence = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": "KITE_ADJUSTED_PARQUET",
        "timeframe": "1D",
        "scan_mode": "ROLLING_WALK_FORWARD" if arguments.historical_bars else "LATEST_BAR",
        "historical_bars": arguments.historical_bars or None,
        "as_of_date_requested": arguments.as_of_date,
        "constituent_source": ("LOCAL_ADJUSTED_PARQUET_PARTITIONS" if arguments.all_local_symbols else
                               arguments.symbols_file.as_posix() if arguments.symbols_file else
                               arguments.constituents_file.as_posix() if arguments.constituents_file else
                               arguments.constituents_url),
        "constituent_snapshot": snapshot_path.as_posix(),
        "config": asdict(config),
        "trade_plan_config": asdict(plan),
        "symbols_requested": int(len(constituents)),
        "symbols_covered": int(len(constituents) - len(coverage_gaps)),
        "coverage_gaps": coverage_gaps,
        "matches": matches,
    }
    json_path = report_root / f"vpa_three_leg_{universe_name}_{timestamp}.json"
    csv_path = report_root / f"vpa_three_leg_{universe_name}_{timestamp}.csv"
    json_path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    display_columns = {
        "strategy": "Strategy", "symbol": "Symbol", "cmp": "CMP ₹", "entry": "Entry ₹",
        "stop": "Stop ₹", "target_1": "Target 1 ₹", "target_2": "Target 2 ₹",
        "rr_target_1": "R:R", "rule_checks_and_measured_values": "Rule Checks and Measured Values",
        "as_of_date": "As Of", "origin_date": "Leg 1 Start", "leg1_high_date": "Leg 1 High",
        "leg2_low_date": "Leg 2 Low", "candle_pattern": "Trigger Candle", "rsi_level": "RSI Support",
        "rsi_value": "RSI Value", "scenario": "Structural Scenario", "ath": "Cumulative ATH ₹",
        "ath_discount_pct": "ATH Discount", "sma": "SMA ₹", "sma_match_location": "SMA Check",
        "sma_distance_pct": "SMA Distance", "signal_date": "Signal Date", "date_o": "Date O",
        "date_a": "Date a", "date_b": "Date b",
    }
    pd.DataFrame(matches).rename(columns=display_columns).reindex(columns=list(display_columns.values())).to_csv(csv_path, index=False)
    print(json.dumps({"json": str(json_path), "csv": str(csv_path), "matches": len(matches),
                      "covered": evidence["symbols_covered"], "requested": evidence["symbols_requested"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
