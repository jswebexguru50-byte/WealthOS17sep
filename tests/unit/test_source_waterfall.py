import os
import sqlite3
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fundamental"))
from canonical_fact_store import FactStore  # noqa: E402
from source_waterfall import SourceWaterfallEngine, PRIORITY  # noqa: E402

T0 = datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc)
DDL = """CREATE TABLE canonical_fact_store (symbol TEXT NOT NULL, field TEXT NOT NULL, value TEXT, source TEXT,
 confidence REAL, fetched_at TEXT, ttl_seconds INTEGER, PRIMARY KEY (symbol, field))"""


class Src:
    def __init__(self, name, data, log):
        self.name, self.data, self.log = name, data, log

    def __call__(self, symbols, fields):
        self.log.append((self.name, list(symbols), list(fields)))
        return {s: {f: ({"value": self.data[(s, f)], "as_of": "x", "source": self.name}
                        if (s, f) in self.data else None) for f in fields} for s in symbols}


def make(datas, **kw):
    conn = sqlite3.connect(":memory:")
    conn.execute(DDL)
    log = []
    srcs = {n: Src(n, d, log) for n, d in datas.items()}
    t = [T0]
    eng = SourceWaterfallEngine(srcs, FactStore(conn), lambda: t[0], **kw)
    return eng, conn, log, t


class T(unittest.TestCase):
    def test_priority_order_and_stop_at_first_hit(self):
        eng, _, log, _ = make({"screener_in": {("A", "pe"): 9}, "kite": {("A", "pe"): 5},
                               "trendlyne_mcp": {}, "upstox": {("A", "pe"): 7}})
        r = eng.resolve(["A"], ["pe"])
        self.assertEqual([c[0] for c in log], ["trendlyne_mcp", "upstox"])
        self.assertEqual(r["values"]["A"]["pe"], 7)
        self.assertEqual(r["provenance"]["A"]["pe"]["source"], "upstox")
        self.assertEqual(PRIORITY, ("trendlyne_mcp", "tradingview", "trendlyne_web", "upstox", "kite",
                                    "nse_bse", "mca", "news", "screener_in"))

    def test_zero_calls_on_fresh_cache_and_expiry(self):
        eng, _, log, t = make({"trendlyne_mcp": {("A", "pe"): 12.5}})
        eng.resolve(["A"], ["pe"])
        self.assertEqual(len(log), 1)
        r = eng.resolve(["A"], ["pe"])
        self.assertEqual(len(log), 1)
        self.assertEqual(r["calls_made"]["total"], 0)
        self.assertTrue(r["provenance"]["A"]["pe"]["from_cache"])
        t[0] = T0 + timedelta(seconds=eng.ttl_for("pe") + 1)
        eng.resolve(["A"], ["pe"])
        self.assertEqual(len(log), 2)

    def test_partial_miss_batching(self):
        eng, _, log, _ = make({"trendlyne_mcp": {("A", "pe"): 1, ("B", "pe"): 2, ("A", "roe"): 3},
                               "tradingview": {("B", "roe"): 4}})
        eng.resolve(["A"], ["pe"])
        log.clear()
        r = eng.resolve(["A", "B"], ["pe", "roe"])
        # A/pe cached; the first source is asked once, in one batch, for the 3 missing pairs
        self.assertEqual(log[0], ("trendlyne_mcp", ["A", "B"], ["pe", "roe"]))
        self.assertEqual([c[0] for c in log], ["trendlyne_mcp", "tradingview"])
        self.assertEqual(log[1], ("tradingview", ["B"], ["roe"]))
        self.assertEqual(r["missing"], [])
        self.assertEqual(r["values"]["B"]["roe"], 4)

    def test_missing_reported(self):
        eng, _, _, _ = make({"trendlyne_mcp": {}})
        self.assertEqual(eng.resolve(["A"], ["pe"])["missing"], [["A", "pe"]])

    def test_conflict_flagging(self):
        eng, _, log, _ = make({"trendlyne_mcp": {("A", "pe"): 10, ("B", "pe"): 10, ("B", "name"): "x"},
                               "tradingview": {("A", "pe"): 12, ("B", "pe"): 10.5, ("B", "name"): "y"}})
        r = eng.resolve(["B", "A"], ["pe", "name"], verify=True)
        self.assertEqual([(c["symbol"], c["field"]) for c in r["conflicts"]], [("A", "pe")])
        self.assertEqual(r["conflicts"][0]["other_source"], "tradingview")
        self.assertAlmostEqual(r["conflicts"][0]["rel_diff"], 2 / 12)
        eng2, *_ = make({"trendlyne_mcp": {("A", "pe"): 10}, "tradingview": {("A", "pe"): 12}})
        self.assertEqual(eng2.resolve(["A"], ["pe"])["conflicts"], [])  # verify off by default

    def test_confidence_overwrite_rule(self):
        conn = sqlite3.connect(":memory:")
        conn.execute(DDL)
        st = FactStore(conn)

        def f(v, c, at=T0, ttl=100):
            return {"symbol": "A", "field": "pe", "value": v, "source": "s",
                    "confidence": c, "fetched_at": at, "ttl_seconds": ttl}
        st.put_many([f(1, 0.8)])
        st.put_many([f(2, 0.5, T0 + timedelta(seconds=10))])  # lower conf, stored fresh -> ignored
        self.assertEqual(st.get("A", "pe", T0)["value"], 1)
        st.put_many([f(3, 0.8, T0 + timedelta(seconds=10))])  # equal -> overwrite
        self.assertEqual(st.get("A", "pe", T0)["value"], 3)
        st.put_many([f(4, 0.1, T0 + timedelta(seconds=500))])  # stored expired -> overwrite
        self.assertEqual(st.get("A", "pe", T0 + timedelta(seconds=501))["value"], 4)
        self.assertIsNone(st.get("A", "pe", T0 + timedelta(seconds=700)))
        self.assertIsNone(st.get("Z", "pe", T0))

    def test_get_many_chunking(self):
        conn = sqlite3.connect(":memory:")
        conn.execute(DDL)
        st = FactStore(conn)
        st.put_many([{"symbol": "S%d" % i, "field": "pe", "value": i, "source": "s", "confidence": 1,
                      "fetched_at": T0, "ttl_seconds": 60} for i in range(1000)])
        self.assertEqual(len(st.get_many(["S%d" % i for i in range(1000)], ["pe"], T0)), 1000)

    def test_failing_source_falls_through(self):
        eng, _, log, _ = make({"tradingview": {("A", "pe"): 3}, "trendlyne_mcp": {}})

        def boom(s, f):
            raise RuntimeError("down")
        eng.sources["trendlyne_mcp"] = boom
        r = eng.resolve(["A"], ["pe"])
        self.assertEqual(r["values"]["A"]["pe"], 3)
        self.assertIn("error", r["calls_made"]["log"][0])


if __name__ == "__main__":
    unittest.main()
