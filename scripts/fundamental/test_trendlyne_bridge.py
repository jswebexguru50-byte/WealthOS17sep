"""
test_trendlyne_bridge.py — unit tests for trendlyne_bridge (no network, no DB).

Run:   python -m pytest scripts/fundamental/test_trendlyne_bridge.py -v
"""

import json
import sqlite3
import types
import unittest
from unittest.mock import MagicMock, patch

import trendlyne_bridge as tb


def _mock_resp(status: int, body: dict):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = body
    r.raise_for_status.return_value = None
    if status >= 400:
        import requests
        r.raise_for_status.side_effect = requests.HTTPError(response=r)
    return r


class TestPostChunk(unittest.TestCase):

    def _good_body(self, data):
        return {"success": True, "message": "ok", "data": data, "errors": {}}

    def test_extracts_value_from_cell(self):
        body = self._good_body({
            "RELIANCE": {"promoter_pct": {"value": 50.1, "as_of": "2026-10-18", "source": "trendlyne_mcp"}},
        })
        with patch("requests.post", return_value=_mock_resp(200, body)):
            result = tb._post_chunk(["RELIANCE"], ["promoter_pct"], tb._ENDPOINT)
        self.assertEqual(result["RELIANCE"]["promoter_pct"], 50.1)

    def test_null_cell_becomes_none(self):
        body = self._good_body({"HDFCBANK": {"pledge_pct": None}})
        with patch("requests.post", return_value=_mock_resp(200, body)):
            result = tb._post_chunk(["HDFCBANK"], ["pledge_pct"], tb._ENDPOINT)
        self.assertIsNone(result["HDFCBANK"]["pledge_pct"])

    def test_missing_symbol_gets_none_fields(self):
        # Symbol present in request but absent from response data
        body = self._good_body({})
        with patch("requests.post", return_value=_mock_resp(200, body)):
            result = tb._post_chunk(["XYZ"], ["promoter_pct"], tb._ENDPOINT)
        self.assertIsNone(result["XYZ"]["promoter_pct"])

    def test_503_raises_unavailable(self):
        body = {"success": False, "message": "not configured", "data": None}
        with patch("requests.post", return_value=_mock_resp(503, body)):
            with self.assertRaises(tb.TrendlyneUnavailableError):
                tb._post_chunk(["RELIANCE"], ["promoter_pct"], tb._ENDPOINT)

    def test_400_raises_bridge_error(self):
        body = {"success": False, "message": "invalid symbol", "data": None}
        with patch("requests.post", return_value=_mock_resp(400, body)):
            with self.assertRaises(tb.TrendlyneBridgeError):
                tb._post_chunk(["R$R"], ["promoter_pct"], tb._ENDPOINT)

    def test_error_key_propagated(self):
        body = {"success": True, "message": "ok",
                "data": {"BADSTOCK": {"promoter_pct": None}},
                "errors": {"BADSTOCK": "no data"}}
        with patch("requests.post", return_value=_mock_resp(200, body)):
            result = tb._post_chunk(["BADSTOCK"], ["promoter_pct"], tb._ENDPOINT)
        self.assertEqual(result["BADSTOCK"]["_error"], "no data")


class TestFetch(unittest.TestCase):

    def test_empty_inputs_return_empty(self):
        self.assertEqual(tb.fetch([], ["promoter_pct"]), {})
        self.assertEqual(tb.fetch(["RELIANCE"], []), {})

    def test_symbols_uppercased(self):
        body = {"success": True, "message": "ok",
                "data": {"RELIANCE": {"promoter_pct": {"value": 50.0, "as_of": "2026-10-18", "source": "trendlyne_mcp"}}},
                "errors": {}}
        with patch("requests.post", return_value=_mock_resp(200, body)):
            result = tb.fetch(["reliance"], ["promoter_pct"])
        self.assertIn("RELIANCE", result)

    def test_chunking_over_max_symbols(self):
        # 55 symbols → 2 chunks (50 + 5)
        syms = [f"SYM{i:03d}" for i in range(55)]
        good_data = {s: {"promoter_pct": {"value": float(i), "as_of": "2026-10-18", "source": "trendlyne_mcp"}}
                     for i, s in enumerate(syms)}
        # Both chunks succeed
        with patch("requests.post") as mock_post:
            def side(url, json, timeout):
                chunk = json["symbols"]
                return _mock_resp(200, {"success": True, "message": "ok",
                                        "data": {s: good_data[s] for s in chunk if s in good_data},
                                        "errors": {}})
            mock_post.side_effect = side
            result = tb.fetch(syms, ["promoter_pct"])
        self.assertEqual(len(result), 55)
        self.assertEqual(mock_post.call_count, 2)


class TestFetchAndStore(unittest.TestCase):

    def _make_db(self):
        con = sqlite3.connect(":memory:")
        con.execute("""CREATE TABLE canonical_fact_store (
            symbol TEXT NOT NULL, field TEXT NOT NULL, value TEXT,
            source TEXT, confidence REAL, fetched_at TEXT, ttl_seconds INTEGER,
            PRIMARY KEY (symbol, field))""")
        return con

    def test_none_values_not_stored(self):
        db = self._make_db()
        body = {"success": True, "message": "ok",
                "data": {"RELIANCE": {"promoter_pct": None}},
                "errors": {}}
        with patch("requests.post", return_value=_mock_resp(200, body)):
            tb.fetch_and_store(db, ["RELIANCE"], ["promoter_pct"])
        count = db.execute("SELECT COUNT(*) FROM canonical_fact_store").fetchone()[0]
        self.assertEqual(count, 0)  # None never stored

    def test_values_stored_correctly(self):
        db = self._make_db()
        body = {"success": True, "message": "ok",
                "data": {"RELIANCE": {
                    "promoter_pct": {"value": 50.1, "as_of": "2026-10-18", "source": "trendlyne_mcp"},
                    "pledge_pct":   {"value": 0.0,  "as_of": "2026-10-18", "source": "trendlyne_mcp"},
                }},
                "errors": {}}
        with patch("requests.post", return_value=_mock_resp(200, body)):
            tb.fetch_and_store(db, ["RELIANCE"], ["promoter_pct", "pledge_pct"])
        rows = db.execute("SELECT field, value, confidence FROM canonical_fact_store ORDER BY field").fetchall()
        self.assertEqual(len(rows), 2)
        fields = {r[0]: json.loads(r[1]) for r in rows}
        self.assertAlmostEqual(fields["pledge_pct"], 0.0)
        self.assertAlmostEqual(fields["promoter_pct"], 50.1)
        self.assertEqual(rows[0][2], 1.0)  # confidence = 1.0

    def test_lower_confidence_not_overwritten(self):
        db = self._make_db()
        # Pre-seed with trendlyne_mcp (confidence=1.0)
        db.execute("INSERT INTO canonical_fact_store VALUES (?,?,?,?,?,?,?)",
                   ("RELIANCE", "promoter_pct", "55.0", "trendlyne_mcp", 1.0, "2099-01-01T00:00:00+00:00", 86400*30))
        db.commit()
        # Attempt to overwrite with tradingview (confidence=0.9)
        body = {"success": True, "message": "ok",
                "data": {"RELIANCE": {"promoter_pct": {"value": 40.0, "as_of": "2026-10-18", "source": "trendlyne_mcp"}}},
                "errors": {}}
        # Simulate a lower-confidence source by temporarily patching CONFIDENCE
        orig = tb.CONFIDENCE
        tb.CONFIDENCE = 0.9
        with patch("requests.post", return_value=_mock_resp(200, body)):
            tb.fetch_and_store(db, ["RELIANCE"], ["promoter_pct"])
        tb.CONFIDENCE = orig
        val = json.loads(db.execute("SELECT value FROM canonical_fact_store WHERE symbol='RELIANCE' AND field='promoter_pct'").fetchone()[0])
        self.assertAlmostEqual(val, 55.0)  # NOT overwritten


class TestTtl(unittest.TestCase):

    def test_pledge_gets_30d_ttl(self):
        self.assertEqual(tb._ttl("pledge_pct"), 30 * 86400)

    def test_roce_gets_30d_ttl(self):
        self.assertEqual(tb._ttl("roce"), 30 * 86400)

    def test_pe_gets_6h_ttl(self):
        self.assertEqual(tb._ttl("pe_ttm"), 6 * 3600)

    def test_unknown_field_gets_default_ttl(self):
        self.assertEqual(tb._ttl("some_unknown_metric_xyz"), tb._DEFAULT_TTL)


if __name__ == "__main__":
    unittest.main()
