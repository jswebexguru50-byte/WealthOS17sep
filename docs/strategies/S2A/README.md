# S2A — Institutional FVG / Consequent Encroachment

The canonical prompt is [S2A.original.txt](S2A.original.txt), copied verbatim from the attachment supplied on 23 September 2026. S2a and S2A are aliases.

The implementation is `scripts/market_data/s2a_institutional_fvg_ce.py`. It has no ATH, SMA, or RSI filters. It first requires a 20% initial advance from a prior swing low, then a significant bullish three-candle FVG, institutional displacement volume, a CE touch within 15 bars, pullback volume absorption, and a confirmed bullish reaction candle.

Use `--verify-synthetic` for its deterministic self-test. Use `--all-local-symbols --as-of-date YYYY-MM-DD` for a current-universe scan.

Implementation amendment (24 September 2026; original prompt unchanged): a signal is excluded when the **highest daily high from the weekly swing-low day through the signal candle** is more than 50% above the lowest low of the preceding 52 completed weekly candles. At least eight completed weeks are required; otherwise the filter fails closed. The current, potentially incomplete week is excluded when identifying the swing-low anchor to prevent lookahead. The signal candle is also rejected when `(high - close) / (high - low) > 0.25`, avoiding a close in the lower 75% of its daily range. These gates are configurable through `enforce_weekly_swing_extension`, `weekly_swing_lookback_weeks`, `weekly_swing_min_completed_weeks`, `weekly_swing_max_advance_pct`, `exclude_upper_wick_pinbar`, and `max_close_from_high_range_ratio` in `S2AConfig`. The output records the reference weekly low, peak, measured advance, and close location.
