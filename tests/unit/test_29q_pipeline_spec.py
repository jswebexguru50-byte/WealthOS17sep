"""Isolated regression coverage for DEVELOPER_BOT_SPEC_29Q_PIPELINE.md.

This suite creates its own SQLite database and never opens portfolio.db for
writing.  The test labels in comments map directly to the 30 acceptance cases.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'fundamental'))
sys.path.insert(0, str(ROOT))

from canonical_fact_store import FactStore
from f_filter_engine import compute_f_filters
from source_waterfall import SourceWaterfallEngine, detect_conflicts
from trendlyne_bridge import TrendlyneUnavailableError, fetch
from run_scan_dossier import fetch_ohlcv_batched, get_scan_universe, run_fundamentals
from nse_shp_ingest import ingest_rows


def make_db():
    db = sqlite3.connect(':memory:')
    db.executescript("""
        CREATE TABLE DailyOHLCV(symbol TEXT, trade_date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL);
        CREATE TABLE HistoricalShareholdingPattern(symbol TEXT, promoter_pct REAL, fii_pct REAL, dii_pct REAL, pledge_pct REAL, quarter_label TEXT, as_of_date TEXT);
        CREATE TABLE HistoricalFinancialStatements(symbol TEXT, period_label TEXT, statement_type TEXT, net_profit_pat_cr REAL, sales_cr REAL, opm_pct REAL, cfo_cr REAL, borrowings_cr REAL, total_assets_cr REAL, equity_capital_cr REAL, reserves_cr REAL, eps REAL);
        CREATE TABLE canonical_fact_store(symbol TEXT NOT NULL, field TEXT NOT NULL, value TEXT, source TEXT, confidence REAL, fetched_at TEXT, ttl_seconds INTEGER, PRIMARY KEY(symbol, field));
        CREATE TABLE data_conflicts(symbol TEXT, field TEXT, source_a TEXT, source_b TEXT, diff_pct REAL, detected_at TEXT);
        CREATE VIEW v_scan_universe_latest AS SELECT DISTINCT symbol FROM DailyOHLCV;
        CREATE VIEW v_latest_shareholding AS SELECT * FROM HistoricalShareholdingPattern;
    """)
    return db


class PipelineSpecTests(unittest.TestCase):
    def setUp(self):
        self.db = make_db()

    def tearDown(self):
        self.db.close()

    def test_unit_f_filter_contract(self):
        # U01–U12, including U03/U07/U08 zero-fabrication cases.
        qs = [{'pat_cr': 10, 'cfo_cr': 8, 'ebitda_cr': 10,
               'total_assets_cr': 200, 'borrowings_cr': 100} for _ in range(8)]
        tv = {'roce_fy': 40, 'roa_fy': 90, 'roe_fy': 30, 'inst_total_pct': 8}
        sh = {'promoter_pct': 70, 'pledge_pct': 0}
        r = compute_f_filters('PASS', tv, sh, qs)
        self.assertTrue(r['F1_pass']); self.assertTrue(r['F2_pass']); self.assertTrue(r['F5_pass'])
        self.assertEqual(r['F6_inst_pct'], 8); self.assertTrue(r['F6_pass'])
        self.assertTrue(r['F7_pass'])
        self.assertIn('ROCE FY', compute_f_filters('TV', tv, sh, [])['F3_source'])
        self.assertEqual(compute_f_filters('X', {}, {'promoter_pct': None}, [])['F1_pass'], None)
        self.assertEqual(compute_f_filters('X', {}, {'pledge_pct': None}, [])['F5_pass'], None)
        self.assertIsNone(compute_f_filters('X', {}, {}, qs[:7])['F2_pass'])
        zero_pat = list(qs); zero_pat[2] = {**zero_pat[2], 'pat_cr': 0}
        self.assertFalse(compute_f_filters('X', tv, sh, zero_pat)['F2_pass'])
        unknown = compute_f_filters('UNKNOWN', {}, {}, [])
        self.assertEqual(unknown['f_unknowns'], 7)
        self.assertTrue(all(unknown[f'F{i}_pass'] is None for i in range(1, 8)))

    def test_waterfall_confidence_missing_and_conflicts(self):
        # I03/I04/I06, N01 and P3-9.
        store = FactStore(self.db)
        now = datetime(2026, 10, 18, tzinfo=timezone.utc)
        store.put_many([{'symbol': 'A', 'field': 'promoter_pct', 'value': 70,
                         'source': 'trendlyne_mcp', 'confidence': 1.0, 'fetched_at': now, 'ttl_seconds': 9999}])
        store.put_many([{'symbol': 'A', 'field': 'promoter_pct', 'value': 65,
                         'source': 'tradingview', 'confidence': .9, 'fetched_at': now, 'ttl_seconds': 9999}])
        store.put_many([{'symbol': 'A', 'field': 'promoter_pct', 'value': 71,
                         'source': 'trendlyne_mcp', 'confidence': 1.0, 'fetched_at': now, 'ttl_seconds': 9999}])
        self.assertEqual(store.get('A', 'promoter_pct', now)['value'], 70)
        before = self.db.execute('SELECT count(*) FROM canonical_fact_store').fetchone()[0]
        SourceWaterfallEngine(self.db).put_field('A', 'pledge_pct', None, 'manual', .7)
        self.assertEqual(self.db.execute('SELECT count(*) FROM canonical_fact_store').fetchone()[0], before)
        conflict = detect_conflicts('A', 'roce', 50, 'tradingview', 30, 'trendlyne_mcp')
        self.assertTrue(conflict['conflict'])
        engine = SourceWaterfallEngine(self.db)
        self.assertTrue(engine.record_conflict(conflict))
        self.assertEqual(self.db.execute('SELECT count(*) FROM data_conflicts').fetchone()[0], 1)
        engine.store.put_many([{'symbol': 'A', 'field': 'roce', 'value': 30,
                                'source': 'trendlyne_mcp', 'confidence': 1.0,
                                'fetched_at': datetime.now(timezone.utc), 'ttl_seconds': 3600}])
        self.assertEqual(engine.record_external_conflicts('A', {'roce_fy': 50}), 1)
        self.assertEqual(self.db.execute('SELECT count(*) FROM data_conflicts').fetchone()[0], 2)
        self.assertEqual(SourceWaterfallEngine(self.db).get_shareholding(['MISSING']), {})

    def test_db_shareholding_waterfall_and_batching(self):
        # I01/I02/I05/I07/I08, N04.
        self.db.executemany('INSERT INTO DailyOHLCV VALUES (?,?,?,?,?,?,?)',
                            [(f'S{i}', '2026-10-01', 1, 2, 1, 1.5, 100) for i in range(600)])
        self.db.execute("INSERT INTO HistoricalShareholdingPattern VALUES ('S0',70,3,3,0,'Sep 2026','2026-09-30')")
        rows = fetch_ohlcv_batched(self.db, get_scan_universe(self.db), '2026-10-01', 200)
        direct = self.db.execute('SELECT symbol, trade_date, open, high, low, close, volume FROM DailyOHLCV WHERE trade_date >= ?', ('2026-10-01',)).fetchall()
        self.assertEqual(set(rows), set(direct))
        with self.assertRaises(ValueError): fetch_ohlcv_batched(self.db, ['S0'], '2026-10-01', 501)
        got = SourceWaterfallEngine(self.db).get_shareholding(['S0'])['S0']
        self.assertEqual(got['sh_quarter'], 'Sep 2026')

    def test_filtered_fundamentals_and_unconfigured_bridge(self):
        # P02, N03, N05.
        self.assertEqual(run_fundamentals(self.db, []), ({}, {}))
        self.db.execute("INSERT INTO HistoricalShareholdingPattern VALUES ('A',70,3,3,0,'Sep 2026','2026-09-30')")
        self.db.execute("INSERT INTO HistoricalFinancialStatements VALUES ('A','Q1','QUARTERLY',1,2,3,4,5,6,7,8,9)")
        sh, fin = run_fundamentals(self.db, ['A'])
        self.assertEqual(set(sh), {'A'}); self.assertEqual(set(fin), {'A'})
        old = os.environ.pop('TRENDLYNE_MCP_URL', None)
        try:
            with self.assertRaises(TrendlyneUnavailableError): fetch(['A'], ['promoter_pct'])
        finally:
            if old is not None: os.environ['TRENDLYNE_MCP_URL'] = old

    def test_p3_trend_and_nse_idempotency(self):
        # P3-6/P3-7/P3-8: official-stage rows are idempotent and no exit trend passes.
        rows = [{'symbol': 'NSE', 'as_of_date': '2026-09-30', 'quarter_label': 'Sep 2026',
                 'promoter_pct': 70, 'fii_pct': 3, 'dii_pct': 3, 'pledge_pct': 0}]
        self.assertEqual(ingest_rows(self.db, rows), 1)
        self.assertEqual(ingest_rows(self.db, rows), 0)
        downtrend = compute_f_filters('NSE', {}, {'inst_total_pct': 8,
                                        'inst_history': [8, 9, 10, 11]}, [])
        self.assertFalse(downtrend['F6_trend_pass'])
        uptrend = compute_f_filters('NSE', {}, {'inst_total_pct': 8,
                                      'inst_history': [8, 8, 7, 6]}, [])
        self.assertTrue(uptrend['F6_trend_pass'])


if __name__ == '__main__':
    unittest.main()
