# S5a implementation note

S5a preserves the supplied business brief in `S5A.original.txt`. Weekly candles qualify the 52-week candidate list; daily candles are used for the 50/200 DMA trend test, VCP structures, entry timing, and ATR stop.

The brief does not define a pivot/swing algorithm. Therefore the data/chart layer supplies the previous daily swing high and daily VCP contraction structures. The evaluator never invents a pivot. A VCP contraction reports the positive magnitude of the supplied formula: `(1 - swingLow / swingHigh) * 100`.

The VCP count is two to three. The advance-versus-pullback volume comparison is removed. Instead, supply dry-up must be `final five daily base sessions average volume / VMA(20) <= 0.85`, calculated at the supplied latest VCP base end date.

“Preferably above 50 DMA,” “breakouts usually happen in 4–8 weeks,” and the two qualitative post-buy items are displayed as observations, not hidden qualification filters.
