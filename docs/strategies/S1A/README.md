# S1A — VPA three-leg swing setup

The canonical user prompt is [S1A.original.txt](S1A.original.txt), copied verbatim from the attachment supplied on 23 September 2026. S1a and S1A are aliases for this specification.

Call it with: "Run S1A across the full universe as of YYYY-MM-DD and show matches and coverage."

Preserve the canonical file unchanged. Put implementation decisions, tests, and subsequent user-requested variants in separate files. Do not confuse this specification with S1_VPA_BASE_BREAKOUT.

`scripts/market_data/vpa_three_leg_screen.py` is the saved S1A implementation. It includes the canonical Doji exclusion and bullish-engulfing trigger rules. Run it with `--all-local-symbols --as-of-date YYYY-MM-DD` for an S1A snapshot across the locally available universe.

An ATH calculated from the locally available history is only the maximum within that history; do not describe it as verified lifetime ATH without sufficient data. A current-date candle may be incomplete; use an explicit completed evaluation date for an end-of-day scan.
