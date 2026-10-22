# NRI WealthOS: Institutional-Grade 5-Year PIT Backtesting Engine
## Comprehensive Architectural Blueprint — Zero Fabrication Architecture (ZFA)

---

## PART I: SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NRI WealthOS BACKTESTING ENGINE v3.0                      │
│                    Zero Fabrication Architecture (ZFA)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  DATA LAYER          │  SIGNAL LAYER        │  EXECUTION LAYER              │
│  ─────────────────   │  ─────────────────   │  ─────────────────            │
│  PIT OHLCV           │  Telemetry Combos    │  Fill Simulator               │
│  Corporate Actions   │  Pure Tech Strats    │  Slippage Model               │
│  F&O Chain Data      │  Regime Classifier   │  Position Sizer               │
│  Delivery/Float      │  Signal Combiner     │  Risk Manager                 │
│  Fundamental DB      │  Confidence Scorer   │  Portfolio Aggregator         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ANALYTICS LAYER     │  CALIBRATION LAYER   │  OUTPUT LAYER                 │
│  ─────────────────   │  ─────────────────   │  ─────────────────            │
│  Equity Curve        │  Brier Score         │  Per-Strategy Reports         │
│  Drawdown Engine     │  Walk-Forward        │  Regime Attribution           │
│  Sharpe/Sortino      │  Overfitting Guard   │  Tier-wise Breakdown          │
│  Profit Factor       │  Monte Carlo         │  Recommendation Mapping       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PART II: DATA ARCHITECTURE & POINT-IN-TIME INTEGRITY

### 2.1 PIT Data Schema

```python
# ─────────────────────────────────────────────────────────────────
# SCHEMA: PIT_OHLCV_RECORD
# Every field carries the exact timestamp at which it was KNOWN,
# not when the event occurred. This is the ZFA contract.
# ─────────────────────────────────────────────────────────────────

@dataclass
class PITRecord:
    symbol:           str        # BSE/NSE ticker
    date:             date       # Calendar date (trading day)
    open:             float      # Adjusted open (post-CA)
    high:             float      # Adjusted high
    low:              float      # Adjusted low
    close:            float      # Adjusted close
    volume:           int        # Total volume (shares)
    delivery_vol:     int        # Delivery volume (CDSL/NSDL)
    delivery_pct:     float      # delivery_vol / volume * 100
    
    # F&O fields (NULL for non-F&O scrips)
    oi_futures:       Optional[float]   # Open Interest futures (contracts)
    oi_calls:         Optional[float]   # Total call OI across strikes
    oi_puts:          Optional[float]   # Total put OI across strikes
    pcr_oi:           Optional[float]   # Put/Call Ratio by OI
    max_pain:         Optional[float]   # Max pain strike price
    iv_atm:           Optional[float]   # ATM implied volatility
    
    # Fundamental snapshot (quarterly, PIT-lagged by 45 days)
    revenue_ttm:      Optional[float]   # TTM Revenue (INR Cr)
    pat_ttm:          Optional[float]   # TTM PAT (INR Cr)
    roe_ttm:          Optional[float]   # TTM ROE (%)
    roce_ttm:         Optional[float]   # TTM ROCE (%)
    debt_equity:      Optional[float]   # D/E ratio
    promoter_hold:    Optional[float]   # Promoter holding (%)
    dii_hold:         Optional[float]   # DII holding (%)
    fii_hold:         Optional[float]   # FII holding (%)
    
    # Corporate action flags
    split_factor:     float      # 1.0 if no split, else adjustment factor
    bonus_factor:     float      # 1.0 if no bonus
    dividend:         float      # Dividend per share (INR)
    
    # Market structure
    circuit_limit:    float      # 5%, 10%, or 20% circuit
    market_cap_tier:  int        # 1=Large, 2=Mid, 3=Small, 4=Micro
    is_fo_eligible:   bool       # F&O eligibility on this date
    
    # Metadata
    data_available_ts: datetime  # When this data became available (PIT anchor)
    
    # ─── ZFA CONSTRAINT ───────────────────────────────────────────
    # RULE: No field in this record may reference data with
    # data_available_ts > simulation_current_date.
    # Violation = LOOKAHEAD CONTAMINATION → trade invalidated.
    # ──────────────────────────────────────────────────────────────
```

### 2.2 Corporate Action Adjustment Protocol

```python
def adjust_price_series_pit(
    raw_series: pd.DataFrame,
    corporate_actions: pd.DataFrame,
    simulation_date: date
) -> pd.DataFrame:
    """
    Point-in-Time price adjustment.
    
    CRITICAL: Adjustments are applied BACKWARD from the CA date.
    Forward prices (post-CA) remain unadjusted in raw form.
    This prevents future-CA contamination.
    
    Adjustment factor for splits:
        F_split = 1 / split_ratio   (e.g., 1:2 split → F = 0.5)
    
    Adjustment factor for bonus:
        F_bonus = N / (N + M)       (e.g., 1:1 bonus → F = 0.5)
    
    Combined adjustment:
        P_adjusted(t) = P_raw(t) × ∏[F_i for all CA_i where CA_date_i > t]
    
    Only CAs with ex_date <= simulation_date are applied.
    """
    adjusted = raw_series.copy()
    
    # Filter CAs known at simulation_date (PIT constraint)
    known_cas = corporate_actions[
        corporate_actions['announcement_date'] <= simulation_date
    ].sort_values('ex_date', ascending=False)
    
    for _, ca in known_cas.iterrows():
        if ca['ex_date'] > simulation_date:
            continue  # Future CA — not yet known
            
        mask = adjusted['date'] < ca['ex_date']
        
        if ca['type'] == 'SPLIT':
            factor = 1.0 / ca['ratio']
        elif ca['type'] == 'BONUS':
            n, m = ca['bonus_n'], ca['bonus_m']
            factor = n / (n + m)
        elif ca['type'] == 'DIVIDEND':
            # Price adjustment for dividend
            factor = (ca['pre_div_close'] - ca['dividend']) / ca['pre_div_close']
        else:
            factor = 1.0
            
        adjusted.loc[mask, ['open','high','low','close']] *= factor
        adjusted.loc[mask, 'volume'] /= factor  # Volume inverse adjustment
        
    return adjusted
```

---

## PART III: POINT-IN-TIME SLIDING WINDOW SIMULATION LOOP

### 3.1 Master Simulation Loop Architecture

```python
class PITBacktestEngine:
    """
    Master PIT Sliding Window Simulation Loop.
    
    ARCHITECTURE PRINCIPLE:
    ─────────────────────────────────────────────────────────────────
    At each simulation_date t:
      - KNOWN: All data with data_available_ts <= t
      - FORBIDDEN: Any data with data_available_ts > t
      - EXECUTION: Signals generated on close(t) → filled at open(t+1)
      - EXCEPTION: Gap-up/gap-down scenarios use open(t+1) as fill
    ─────────────────────────────────────────────────────────────────
    
    Sliding Window Parameters:
      - Lookback window L: 252 bars (1 year) for indicator computation
      - Minimum warm-up: 60 bars before first trade allowed
      - Walk-forward OOS window: 63 bars (1 quarter)
      - Rebalance frequency: Daily signal generation, weekly position review
    """
    
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.portfolio = Portfolio(initial_capital=config.initial_capital)
        self.signal_engine = SignalEngine(config)
        self.execution_engine = ExecutionEngine(config)
        self.risk_engine = RiskEngine(config)
        self.analytics = AnalyticsEngine()
        
    def run(self) -> BacktestResult:
        
        # ── PHASE 0: DATA LOADING & VALIDATION ──────────────────────
        universe = self._load_pit_universe()
        self._validate_pit_integrity(universe)
        
        # ── PHASE 1: WARM-UP PERIOD ──────────────────────────────────
        # First 60 trading days: compute indicators, no trades
        warmup_end = self.config.start_date + timedelta(days=90)  # ~60 trading days
        
        # ── PHASE 2: MAIN SIMULATION LOOP ───────────────────────────
        equity_curve = []
        trade_log = []
        signal_log = []
        
        trading_days = self._get_trading_calendar(
            self.config.start_date, 
            self.config.end_date
        )
        
        for i, current_date in enumerate(trading_days):
            
            # ── STEP 1: CONSTRUCT PIT SNAPSHOT ──────────────────────
            # ONLY data available as of market close on current_date
            pit_snapshot = self._build_pit_snapshot(
                universe=universe,
                as_of_date=current_date,
                lookback_bars=252
            )
            
            # ── STEP 2: REGIME CLASSIFICATION ───────────────────────
            regime = self.regime_classifier.classify(
                pit_snapshot=pit_snapshot,
                current_date=current_date
            )
            
            # ── STEP 3: PROCESS PENDING FILLS (from t-1 signals) ────
            # Fills happen at OPEN of current_date for signals from t-1
            if i > 0:
                fills = self.execution_engine.process_pending_orders(
                    orders=self.portfolio.pending_orders,
                    current_bar=pit_snapshot,
                    current_date=current_date
                )
                self.portfolio.apply_fills(fills)
                trade_log.extend(fills)
            
            # ── STEP 4: MANAGE OPEN POSITIONS ───────────────────────
            # Check intraday high/low for stop/target resolution
            position_actions = self.risk_engine.manage_positions(
                open_positions=self.portfolio.open_positions,
                current_bar=pit_snapshot,
                current_date=current_date,
                regime=regime
            )
            self.portfolio.apply_position_actions(position_actions)
            
            # ── STEP 5: GENERATE SIGNALS (using CLOSE of current_date)
            if current_date >= warmup_end:
                signals = self.signal_engine.generate_signals(
                    pit_snapshot=pit_snapshot,
                    portfolio=self.portfolio,
                    regime=regime,
                    current_date=current_date
                )
                signal_log.extend(signals)
                
                # ── STEP 6: RISK FILTER & POSITION SIZING ───────────
                approved_orders = self.risk_engine.filter_and_size(
                    signals=signals,
                    portfolio=self.portfolio,
                    regime=regime,
                    current_date=current_date
                )
                
                # ── STEP 7: QUEUE ORDERS FOR NEXT-DAY EXECUTION ─────
                # Orders execute at OPEN of (current_date + 1)
                self.portfolio.queue_orders(approved_orders)
            
            # ── STEP 8: MARK-TO-MARKET & EQUITY CURVE ───────────────
            portfolio_value = self.portfolio.mark_to_market(
                prices=pit_snapshot.close_prices,
                current_date=current_date
            )
            
            equity_curve.append({
                'date': current_date,
                'portfolio_value': portfolio_value,
                'cash': self.portfolio.cash,
                'invested': portfolio_value - self.portfolio.cash,
                'num_positions': len(self.portfolio.open_positions),
                'regime': regime.label,
                'drawdown': self._compute_running_drawdown(equity_curve, portfolio_value)
            })
            
        # ── PHASE 3: CLOSE ALL POSITIONS AT END ─────────────────────
        self._close_all_positions_at_end(trading_days[-1], pit_snapshot)
        
        # ── PHASE 4: ANALYTICS COMPUTATION ──────────────────────────
        return self.analytics.compute_full_report(
            equity_curve=pd.DataFrame(equity_curve),
            trade_log=pd.DataFrame(trade_log),
            signal_log=pd.DataFrame(signal_log),
            config=self.config
        )
```

### 3.2 PIT Snapshot Builder

```python
def _build_pit_snapshot(
    self,
    universe: Dict[str, pd.DataFrame],
    as_of_date: date,
    lookback_bars: int = 252
) -> PITSnapshot:
    """
    Constructs the exact information set available at market close
    on as_of_date. This is the ZFA enforcement point.
    
    LOOKAHEAD PREVENTION RULES:
    ────────────────────────────────────────────────────────────────
    1. OHLCV: Use bars where date <= as_of_date
    2. Fundamentals: Use quarterly results where 
       announcement_date <= as_of_date AND
       result_date <= (as_of_date - 45 days)  [45-day PIT lag]
    3. F&O Data: Use EOD data where date <= as_of_date
    4. Shareholding: Use data where filing_date <= as_of_date
       (SEBI mandates filing within 21 days of quarter end)
    5. Corporate Actions: Use CAs where announcement_date <= as_of_date
    ────────────────────────────────────────────────────────────────
    """
    snapshot = PITSnapshot(as_of_date=as_of_date)
    
    for symbol, full_data in universe.items():
        
        # ── PRICE DATA: Strict date filter ──────────────────────────
        price_data = full_data[full_data['date'] <= as_of_date].tail(lookback_bars)
        
        if len(price_data) < 60:  # Insufficient history
            continue
            
        # ── FUNDAMENTAL DATA: 45-day PIT lag ────────────────────────
        fundamental_cutoff = as_of_date - timedelta(days=45)
        fundamental_data = self.fundamental_db.get_latest_pit(
            symbol=symbol,
            as_of_date=fundamental_cutoff
        )
        
        # ──