# S2A — Institutional FVG / Consequent Encroachment

The canonical prompt is [S2A.original.txt](S2A.original.txt), copied verbatim from the attachment supplied on 23 September 2026. S2a and S2A are aliases.

The implementation is `scripts/market_data/s2a_institutional_fvg_ce.py`. It has no ATH, SMA, or RSI filters. It requires a significant bullish three-candle FVG, institutional displacement volume, a CE touch within 15 bars, pullback volume absorption, and a confirmed bullish reaction candle.

Use `--verify-synthetic` for its deterministic self-test. Use `--all-local-symbols --as-of-date YYYY-MM-DD` for a current-universe scan.
