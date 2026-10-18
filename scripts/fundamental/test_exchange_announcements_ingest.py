import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import exchange_announcements_ingest as m  # noqa: E402


class T(unittest.TestCase):
    def test_parse_dt(self):
        self.assertEqual(m.parse_dt("17-Oct-2026 19:32:52"), "2026-10-17T19:32:52")
        self.assertEqual(m.parse_dt("28-MAY-2026 13:39:47"), "2026-05-28T13:39:47")
        self.assertEqual(m.parse_dt("2026-10-17T19:32:41.94"), "2026-10-17T19:32:41")
        self.assertIsNone(m.parse_dt("garbage"))
        self.assertIsNone(m.parse_dt(None))

    def test_classify(self):
        c = "Analysts/Institutional Investor Meet/Con. Call Updates"
        self.assertEqual(m.classify(c, "Transcript of the discussion"), "concall_transcript")
        self.assertEqual(m.classify(c, "Audio recording of the call"), "concall_audio_link")
        self.assertEqual(m.classify(c, "Schedule of call"), "concall_intimation")
        self.assertEqual(m.classify("Investor Presentation", "x"), "investor_presentation")
        self.assertEqual(m.classify("Credit Rating", "x"), "exchange_announcement")

    def test_nse_rows_no_attachment_no_row(self):
        items = [{"desc": "Updates", "attchmntText": "t", "an_dt": "17-Oct-2026 19:32:52", "attchmntFile": None}]
        self.assertEqual(m.nse_ann_rows("X", items), [])

    def test_audio_url_extracted(self):
        items = [{"desc": "Analysts/Institutional Investor Meet/Con. Call Updates",
                  "attchmntText": "Audio recording https://example.org/a.mp3 available",
                  "an_dt": "17-Oct-2026 19:32:52", "attchmntFile": None}]
        rows = m.nse_ann_rows("X", items)
        self.assertEqual([r["url"] for r in rows], ["https://example.org/a.mp3"])
        self.assertEqual(rows[0]["doc_type"], "concall_audio_link")

    def test_ar_latest_five(self):
        items = [{"fromYr": str(y), "toYr": str(y + 1), "fileName": "https://h/%d.pdf" % y,
                  "broadcast_dttm": "01-JUL-%d 10:00:00" % (y + 1)} for y in range(2015, 2026)]
        rows = m.nse_ar_rows("X", items)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["title"], "Annual Report FY2025-2026")

    def test_window_and_dedupe(self):
        a = m.mkrow("X", "exchange_announcement", "t", "2020-01-01T00:00:00", "NSE", "u1")
        b = m.mkrow("X", "exchange_announcement", "t", "2026-01-01T00:00:00", "NSE", "u2")
        c = m.mkrow("X", "exchange_announcement", "t", "2026-01-01T00:00:00", "NSE", "u2")
        out = m.dedupe_window([a, b, c], "2024-10-18T00:00:00")
        self.assertEqual([r["url"] for r in out], ["u2"])

    def test_refuses_portfolio_db(self):
        with self.assertRaises(SystemExit):
            m.open_stage("portfolio.db")
        with self.assertRaises(SystemExit):
            m.open_stage("C:/x/portfolio_copy.db")

    def test_unfetched_rows_have_null_hash(self):
        r = m.mkrow("X", "annual_report", "t", None, "NSE", "u")
        self.assertIsNone(r["content_sha256"])
        self.assertIsNone(r["local_path"])


if __name__ == "__main__":
    unittest.main()
