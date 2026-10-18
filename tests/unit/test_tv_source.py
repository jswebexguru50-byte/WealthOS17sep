"""Tests use recorded-SHAPE fixtures (real tradingview-screener column names, placeholder test values).
Nothing here is real market data and nothing in tv_source.py produces such values."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fundamental"))
from tv_source import tradingview_adapter, FIELD_MAP, UNSUPPORTED  # noqa: E402
import source_waterfall  # noqa: E402

CACHE = {  # shape of tv_universe.json (fetch_tv_universe.df_to_universe_dict)
    "AAA": {"exchange": "NSE", "pe": 11.5, "roe": 7.0, "mkt_cap_cr": 100.0, "sector": "Test Sector", "rsi": None},
    "BBB": {"exchange": "NSE", "pe": 0, "roe": float("nan"), "sector": ""},
}
META = {"fetched_at": "2026-10-01T09:00:00"}


class Q:
    def __init__(self, fail_times=0, rows=None):
        self.calls, self.fail, self.rows = [], fail_times, rows or []

    def __call__(self, symbols, columns):
        self.calls.append((list(symbols), list(columns)))
        if self.fail > 0:
            self.fail -= 1
            raise RuntimeError("net")
        return [r for r in self.rows if r["symbol"] in symbols]


class TvSourceTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.cp = os.path.join(self.d, "tv_universe.json")
        json.dump(CACHE, open(self.cp, "w"))
        json.dump(META, open(os.path.join(self.d, "tv_universe_meta.json"), "w"))
        self.sleeps = []

    def mk(self, q, **kw):
        return tradingview_adapter(cache_path=self.cp, query_fn=q, sleep=self.sleeps.append,
                                   ta_fn=lambda s, e: None, history_fn=lambda s, e: None, **kw)

    def test_cache_hit_zero_network(self):
        q = Q()
        r = self.mk(q)(["AAA"], ["pe", "roe", "market_cap", "sector"])
        self.assertEqual(q.calls, [])
        self.assertEqual(r["AAA"]["pe"], {"value": 11.5, "as_of": META["fetched_at"], "source": "tradingview"})
        self.assertEqual(r["AAA"]["sector"]["value"], "Test Sector")

    def test_cache_known_symbol_missing_value_is_none_no_network(self):
        q = Q()
        r = self.mk(q)(["AAA"], ["rsi"])
        self.assertIsNone(r["AAA"]["rsi"])
        self.assertEqual(q.calls, [])

    def test_nan_and_blank_become_none_zero_kept_as_reported(self):
        r = self.mk(Q())(["BBB"], ["roe", "sector", "pe"])
        self.assertIsNone(r["BBB"]["roe"])
        self.assertIsNone(r["BBB"]["sector"])
        self.assertEqual(r["BBB"]["pe"]["value"], 0)  # TV-reported value passes through unchanged

    def test_unsupported_fields_none_never_zero(self):
        q = Q()
        r = self.mk(q)(["AAA"], list(UNSUPPORTED))
        self.assertTrue(all(v is None for v in r["AAA"].values()))
        self.assertEqual(q.calls, [])

    def test_live_for_cache_miss_batched_and_scaled(self):
        rows = [{"symbol": s, "market_cap_basic": 5e9, "EMA20": 3.0} for s in ("X1", "X2", "X3")]
        q = Q(rows=rows)
        r = self.mk(q, batch_size=2)(["X1", "X2", "X3"], ["market_cap", "ema20"])
        self.assertEqual([len(c[0]) for c in q.calls], [2, 1])
        self.assertEqual(r["X1"]["market_cap"]["value"], 500.0)
        self.assertEqual(r["X3"]["ema20"]["value"], 3.0)
        self.assertRegex(r["X1"]["ema20"]["as_of"], r"^\d{4}-\d{2}-\d{2}T")  # live query time, UTC

    def test_fixed_backoff_then_success_and_final_failure_none(self):
        q = Q(fail_times=2, rows=[{"symbol": "X1", "EMA20": 1.5}])
        r = self.mk(q, backoff=(2, 5, 15))(["X1"], ["ema20"])
        self.assertEqual(self.sleeps, [2, 5])
        self.assertEqual(r["X1"]["ema20"]["value"], 1.5)
        self.sleeps.clear()
        q = Q(fail_times=99)
        r = self.mk(q, backoff=(1, 2))(["X1"], ["ema20"])
        self.assertEqual(self.sleeps, [1, 2])
        self.assertIsNone(r["X1"]["ema20"])

    def test_allow_live_false(self):
        q = Q(rows=[{"symbol": "X1", "EMA20": 1.0}])
        r = self.mk(q, allow_live=False)(["X1"], ["ema20"])
        self.assertEqual(q.calls, [])
        self.assertIsNone(r["X1"]["ema20"])

    def test_optional_ta_and_history_absent_none(self):
        r = self.mk(Q())(["AAA"], ["ta_recommendation", "ohlcv"])
        self.assertIsNone(r["AAA"]["ta_recommendation"])
        self.assertIsNone(r["AAA"]["ohlcv"])

    def test_ta_injected(self):
        fn = tradingview_adapter(cache_path=self.cp, query_fn=Q(), ta_fn=lambda s, e: {"RECOMMENDATION": "BUY"})
        self.assertEqual(fn(["AAA"], ["ta_recommendation"])["AAA"]["ta_recommendation"]["value"], "BUY")

    def test_field_map_columns_are_in_fetch_universe(self):
        src = open(os.path.join(os.path.dirname(__file__), "..", "..", "fetch_tv_universe.py"), encoding="utf-8").read()
        for f, m in FIELD_MAP.items():
            if m["cache"] is not None:
                self.assertIn("'%s'" % m["col"], src, f)

    def test_no_known_null_columns(self):
        # verified live 2026-10-18: these names are accepted by the API but always return null for India
        bad = {"price_to_book_fq", "total_debt_to_equity_fq", "52 Week High", "52 Week Low", "total_debt_to_equity"}
        self.assertFalse(bad & {m["col"] for m in FIELD_MAP.values()})

    def test_roce_unmapped_roic_never_used(self):
        self.assertNotIn("roce", FIELD_MAP)
        self.assertFalse([f for f, m in FIELD_MAP.items() if "invested_capital" in m["col"]])
        self.assertEqual(FIELD_MAP["roce_fy"]["col"], "return_on_capital_employed_fy")

    def test_real_captured_row_shape_live(self):
        # shape captured from tradingview-screener live (india scan); NaN/None mixes are real TV behaviour
        nan = float("nan")
        row = {"symbol": "REAL1", "name": "REAL1", "exchange": "NSE", "price_book_fq": nan, "debt_to_equity": nan,
               "return_on_equity": nan, "price_52_week_high": 1611.2, "total_assets": 1.9078e12,
               "EMA200": 1322.66, "sector": "Energy Minerals", "beta_1_year": 0.94, "Value.Traded": 2.08e10}
        r = self.mk(Q(rows=[row]))(["REAL1"], ["pb", "de_ratio", "roe", "high_52w", "total_assets", "ema200",
                                              "sector", "beta_1y", "value_traded_day", "rsi"])["REAL1"]
        for f in ("pb", "de_ratio", "roe", "rsi"):
            self.assertIsNone(r[f], f)  # NaN / absent column -> None, never 0
        self.assertEqual(r["high_52w"]["value"], 1611.2)
        self.assertAlmostEqual(r["total_assets"]["value"], 190780.0)  # INR -> crore
        self.assertEqual(r["sector"]["value"], "Energy Minerals")

    def test_alias_resolves_bse_scrip_code_via_cache(self):
        json.dump({"500001": "AAA"}, open(os.path.join(self.d, "tv_symbol_aliases.json"), "w"))
        r = self.mk(Q())(["500001"], ["pe"])
        self.assertEqual(r["500001"]["pe"]["value"], 11.5)

    def test_ta_exception_is_none(self):
        def boom(s, e):
            raise RuntimeError("Exchange or symbol not found.")
        fn = tradingview_adapter(cache_path=self.cp, query_fn=Q(), ta_fn=boom, history_fn=boom)
        r = fn(["AAA"], ["ta_recommendation", "ohlcv"])
        self.assertIsNone(r["AAA"]["ta_recommendation"])
        self.assertIsNone(r["AAA"]["ohlcv"])

    def test_registry_aliases_identical_metric(self):
        self.assertIs(FIELD_MAP["pe_ttm"], FIELD_MAP["pe"])
        self.assertEqual(FIELD_MAP["market_cap_cr"]["div"], 1e7)

    def test_stage_writer_nulls_omitted_with_provenance(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
        import fetch_tv_universe as F
        uni = {"AAA": {"exchange": "NSE", "pe": 11.5, "roe": None, "mrq_epoch": 1790726400.0}}
        path = os.path.join(self.d, "stage.jsonl")
        n, fills = F.write_stage(uni, {"AAA": "AAA", "NOPE": "NOPE"}, ["AAA", "NOPE"], "2026-10-18T00:00:00+00:00", path)
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        self.assertEqual(n, 1)
        self.assertEqual(rows[0]["field"], "pe_ttm")
        self.assertEqual(rows[0]["source"], "tradingview")
        self.assertEqual(rows[0]["as_of"], "2026-10-18T00:00:00+00:00")
        self.assertEqual(rows[0]["period_end"], "2026-09-30")
        self.assertNotIn("roe", fills)

    def test_waterfall_factory(self):
        fn = source_waterfall.tradingview_adapter(cache_path=self.cp, allow_live=False)
        self.assertEqual(fn(["AAA"], ["pe"])["AAA"]["pe"]["value"], 11.5)


if __name__ == "__main__":
    unittest.main()
