import json
import os
import sqlite3
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "fundamental"))
import validate_staged as v  # noqa: E402
import load_staged_data as L  # noqa: E402

SHP = {"symbol": "AAA", "quarter_end": "2026-09-30", "source": "NSE_SHP_XBRL", "source_url": "https://x/y.xml",
       "filing_date": "2026-10-10", "fetched_at": "2026-10-18T12:00:00Z", "record_id": "1", "promoter_pct": 60.0,
       "fii_pct": 5.0, "dii_pct": 10.0, "mf_pct": 4.0, "public_pct": 40.0, "pledge_pct": 0.0, "pledged_shares": 0,
       "promoter_shares": 600.0, "total_shares": 1000.0, "flags": []}
TV = {"symbol": "AAA", "field": "ltp", "value": 10.0, "as_of": "2026-10-18T10:00:00+00:00", "period_end": None,
      "source": "tradingview", "tv_column": "close", "exchange": "NSE"}
NOSKIP = {"insert_skipped_NOT_NULL_columns_unknown(fii/dii/public)": 1}


def wr(d, name, rows):
    with open(os.path.join(d, name), "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


def mkdb(path):
    c = sqlite3.connect(path)
    c.executescript("""CREATE TABLE HistoricalShareholdingPattern (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL,
      quarter_label TEXT NOT NULL, as_of_date TEXT, promoter_pct REAL NOT NULL, fii_pct REAL NOT NULL, dii_pct REAL NOT NULL,
      govt_pct REAL DEFAULT 0, others_pct REAL DEFAULT 0, public_pct REAL NOT NULL, employee_trusts_pct REAL DEFAULT 0,
      sum_total_pct REAL NOT NULL, free_float_pct REAL NOT NULL, primary_source TEXT NOT NULL, secondary_source TEXT,
      is_reconciled BOOLEAN DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pledge_pct REAL DEFAULT NULL,
      UNIQUE(symbol, quarter_label));
      CREATE TABLE canonical_fact_store (symbol TEXT NOT NULL, field TEXT NOT NULL, value TEXT, source TEXT, confidence REAL,
      fetched_at TEXT, ttl_seconds INTEGER, PRIMARY KEY (symbol, field));""")
    c.commit()
    c.close()


def seed_hist(db, label, fii, dii):
    c = sqlite3.connect(db)
    c.execute("INSERT INTO HistoricalShareholdingPattern (symbol,quarter_label,as_of_date,promoter_pct,fii_pct,dii_pct,"
              "public_pct,sum_total_pct,free_float_pct,primary_source) VALUES ('AAA',?,'2026-09-30',60,?,?,40,100,40,'X')",
              (label, fii, dii))
    c.commit()
    c.close()


class ValidatorTests(unittest.TestCase):
    def test_provenance_range_and_synthetic(self):
        self.assertEqual(v.check_shp(SHP), [])
        self.assertIn("provenance_source_url", v.check_shp(dict(SHP, source_url=None, record_id=None)))
        self.assertIn("range_pct_fii_pct", v.check_shp(dict(SHP, fii_pct=104.0)))
        self.assertIn("synthetic_marker", v.check_tv(dict(TV, source="mock_tradingview")))
        self.assertIn("range_negative_market_cap", v.check_tv(dict(TV, field="market_cap_cr", value=-5.0)))
        self.assertIn("provenance_as_of", v.check_tv(dict(TV, as_of=None)))

    def test_scale_mismatch_and_unit(self):
        f = {"symbol": "A", "metric": "sales", "value": 161.6853, "raw_value": 1616853000.0, "raw_unit": "INR",
             "unit_normalised_to": "INR_crore", "scope": "CONSOLIDATED", "period_type": "Q", "period_end": "2026-06-30",
             "source_url": "https://x", "filing_id": 1, "available_at": "2026-08-05T00:00:00+00:00", "derived": False}
        self.assertEqual(v.check_fin(f), [])
        self.assertIn("scale_mismatch_inr_vs_crore", v.check_fin(dict(f, value=1616.853)))
        self.assertIn("unit_not_inr_crore", v.check_fin(dict(f, unit_normalised_to="INR")))
        bad = v.tv_cross_field({"A": {"market_cap_cr": 1.0, "ltp": 100.0, "float_shares": 1e9}})
        self.assertIn(("A", "market_cap_cr"), bad)

    def test_conflicting_duplicates_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            wr(d, "shareholding_stage_a.jsonl", [SHP, dict(SHP, fetched_at="2026-10-18T13:00:00Z"), dict(SHP, symbol="BBB"),
                                                  dict(SHP, symbol="BBB", promoter_pct=61.0, public_pct=39.0)])
            acc, rep = v.validate_stage(d)
            k = rep["kinds"]["shareholding"]
            self.assertEqual(k["duplicates_identical_collapsed"], 1)
            self.assertEqual(k["duplicates_conflicting_rejected"], 2)
            self.assertEqual([r["symbol"] for r in acc["shareholding"]], ["AAA"])

    def test_cross_check_reports_not_resolves(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "t.db")
            mkdb(db)
            seed_hist(db, "Sep 2026", 0, 0)
            rep = v.cross_check({"shareholding": [SHP]}, db, seed=1, sample=25)
            self.assertEqual({x["field"] for x in rep["disagreements"]}, {"fii_pct", "dii_pct"})


class LoaderTests(unittest.TestCase):
    def test_idempotent_never_null_overwrite_dry_run_safe(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "t.db")
            mkdb(db)
            wr(d, "shareholding_stage_a.jsonl", [SHP, dict(SHP, symbol="BBB", fii_pct=None)])
            wr(d, "tv_stage.jsonl", [TV, dict(TV, field="sector", value=None, tv_column="sector")])

            def q(s):
                c = sqlite3.connect(db)
                try:
                    return c.execute(s).fetchall()
                finally:
                    c.close()
            L.run(db, d, apply=False, log=lambda *_: None)  # dry-run writes nothing
            self.assertEqual(q("SELECT count(*) FROM HistoricalShareholdingPattern"), [(0,)])
            r1 = L.run(db, d, apply=True, log=lambda *_: None)
            self.assertEqual(r1["loaded"]["shareholding"]["insert"], 1)  # BBB skipped: fii unknown, never zero-filled
            self.assertEqual(r1["loaded"]["shareholding"]["skipped"], NOSKIP)
            self.assertEqual(q("SELECT quarter_label, as_of_date, pledge_pct, sum_total_pct FROM HistoricalShareholdingPattern"),
                             [("Sep 2026", "2026-09-30", 0.0, 100.0)])
            self.assertEqual(q("SELECT field, source, ttl_seconds FROM canonical_fact_store"), [("ltp", "tradingview", 300)])
            r2 = L.run(db, d, apply=True, log=lambda *_: None)  # second run: nothing changes
            for k in ("shareholding", "tv"):
                self.assertEqual((r2["loaded"][k]["insert"], r2["loaded"][k]["update"]), (0, 0))
            # a null in a later stage row must not wipe a stored value
            wr(d, "shareholding_stage_a.jsonl", [dict(SHP, pledge_pct=None, fetched_at="2026-10-19T00:00:00Z")])
            L.run(db, d, apply=True, log=lambda *_: None)
            self.assertEqual(q("SELECT pledge_pct FROM HistoricalShareholdingPattern"), [(0.0,)])

    def test_conflict_kept_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "t.db")
            mkdb(db)
            seed_hist(db, "30-SEP-2026", 1, 2)
            wr(d, "shareholding_stage_a.jsonl", [SHP])
            r = L.run(db, d, kinds=("shareholding",), apply=True, log=lambda *_: None)
            self.assertEqual(r["loaded"]["shareholding"]["conflicts_kept_existing"], 2)
            c = sqlite3.connect(db)
            try:
                self.assertEqual(c.execute("SELECT fii_pct, dii_pct FROM HistoricalShareholdingPattern").fetchall(), [(1.0, 2.0)])
            finally:
                c.close()

    def test_v16_extraction(self):
        sqls = L.extract_v16_sqls()
        self.assertTrue(any("canonical_fact_store" in s for s in sqls))


if __name__ == "__main__":
    unittest.main()
