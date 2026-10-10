import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from fere_promotion_audit import audit, main

class FereAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd(), ignore_cleanup_errors=True); self.db = Path(self.tmp.name) / "fere.db"
        with sqlite3.connect(self.db) as con:
            con.executescript("""
              CREATE TABLE universe(isin TEXT, symbol TEXT);
              CREATE TABLE verified_metric(isin TEXT, period_end TEXT, period_start TEXT, metric TEXT, value REAL, scope TEXT, input_fact_ids TEXT, filing_hashes TEXT, available_at TEXT, status TEXT);
            """)
            con.execute("INSERT INTO universe VALUES (?,?)", ("INE000A01011", "YUKEN"))
            con.execute("INSERT INTO verified_metric VALUES (?,?,?,?,?,?,?,?,?,?)", ("INE000A01011","2025-03-31","2024-04-01","piotroski_f",7,"CONSOLIDATED",'["f1"]','["h1"]','2025-04-01','VERIFIED'))
            con.execute("INSERT INTO verified_metric VALUES (?,?,?,?,?,?,?,?,?,?)", ("INE000A01011","2025-03-31",None,"piotroski_f",7,"CONSOLIDATED",'["f1"]','["h1"]','2025-04-01','VERIFIED'))
    def tearDown(self): self.tmp.cleanup()
    def test_read_only_audit_counts_and_rejects(self):
        before = self.db.read_bytes(); result = audit(self.db)
        y = next(x for x in result["symbols"] if x["symbol"] == "YUKEN")
        self.assertEqual((y["inputRows"], y["promoted"], y["rejected"]), (2, 1, 1))
        self.assertEqual(before, self.db.read_bytes())
    def test_cli_writes_report_only(self):
        out = Path(self.tmp.name) / "report.json"; self.assertEqual(main(["--db", str(self.db), "--out", str(out)]), 0)
        self.assertEqual(json.loads(out.read_text())["mode"], "dry-run")

if __name__ == "__main__": unittest.main()
