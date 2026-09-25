# S4a — Gap Running Stocks

The verbatim request is preserved in `S4A.original.txt`.

Implementation notes, separate from the original strategy:

- A pivot-5 is evaluated as a confirmed five-week fractal (two weeks on either side). No future bars beyond those confirmation bars are used.
- Clarification: the gap rule is a clean daily opening gap only: `today open >= previous trading session close × 1.02`. The weekly-close alternative is not evaluated.
- Clarification: the prior pullback retracement and relative VPA checks are removed. The only pullback controls are pullback ATR / ATR(14) <= 0.50 and the final five base sessions' average volume / VMA(20) <= 0.85.
- The broad-market condition requires real Nifty 500, Nifty Midcap, and Nifty Smallcap daily series. Each must close above either its SMA20 or EMA20.
- The hourly alternative needs real hourly OHLCV and a supplied RSI-support result. S4a does not invent an RSI support level.
- If market cap, benchmark, weekly, or hourly input is unavailable, its rule check is reported as unavailable and cannot pass. The daily swing-high breakout remains the alternative entry route.
