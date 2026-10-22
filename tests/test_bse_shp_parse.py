"""Tests on real BSE responses captured 2026-10-18 via the browser pane (trimmed to used fields)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts", "fundamental"))
import bse_shp_parse as P  # noqa: E402

PCT = "Fld_TotalPercentageOf_A_B_C2"
SH = "Fld_TotalNoOfShares"
CG_Q = {"qtrid": 130, "qtr": "June 2026", "status": "New", "filing_date_time": "2026-07-20T23:52:12.3"}
CG_T1 = [{"Fld_Code": "STA1A2", SH: 887665345, PCT: 56.36},
         {"Fld_Code": "STB1B2B3", SH: 687313904, PCT: 43.64},
         {"Fld_Code": "STABC", SH: 1574979249, PCT: 100}]
CG_SUM = {"Table": [{"Fld_RecordId": 382796, "Fld_IsPledge": False}], "Table1": CG_T1}
CG_PUB = {"Table1": [
    {"Fld_Code": "B1a", "Fld_SubCategory": "Institutions", "Fld_ShareHolderName": "", "Fld_Level": "Mutual Funds/", PCT: 9.93},
    {"Fld_Code": "B1a", "Fld_SubCategory": "Institutions", "Fld_ShareHolderName": "AXIS ELSS TAX SAVER FUND",
     "Fld_Level": "Mutual Funds/", PCT: 1.57},
    {"Fld_Code": "", "Fld_SubCategory": "Institutions (Domestic)", "Fld_ShareHolderName": "", "Fld_Level": "Sub Total B1", PCT: 18.3},
    {"Fld_Code": "", "Fld_SubCategory": "Institutions (Foreign)", "Fld_ShareHolderName": "", "Fld_Level": "Sub Total B2", PCT: 11.97}]}
SG_Q = {"qtrid": 131.0, "qtr": "September 2026", "status": "New", "filing_date_time": "2026-10-08T16:48:11.23"}
SG_SUM = {"Table": [{"Fld_RecordId": 385176, "Fld_IsPledge": False}], "Table1": [
    {"Fld_Code": "STA1A2", SH: 4310000, PCT: 35.01},
    {"Fld_Code": "STB1B2B3", SH: 8000000, PCT: 64.99},
    {"Fld_Code": "STABC", SH: 12310000, PCT: 100}]}
SG_PUB = {"Table1": [{"Fld_Code": "B1", "Fld_SubCategory": "Institutions", "Fld_ShareHolderName": None,
                      "Fld_Level": None, PCT: 0}]}


class T(unittest.TestCase):
    def test_cgpower_matches_nse_stage_row(self):  # NSE stage: 56.36 / fii 11.97 / dii 18.3 / mf 9.93
        r = P.build_row("500093", CG_Q, CG_SUM, CG_PUB)
        self.assertEqual((r["promoter_pct"], r["fii_pct"], r["dii_pct"], r["mf_pct"], r["public_pct"]),
                         (56.36, 11.97, 18.3, 9.93, 43.64))
        self.assertEqual((r["promoter_shares"], r["total_shares"], r["pledge_pct"]), (887665345, 1574979249, 0.0))
        self.assertEqual((r["quarter_end"], r["filing_date"], r["source"]), ("2026-06-30", "2026-07-20", "bse"))
        self.assertEqual(r["flags"], [])

    def test_unfiled_split_is_null_not_inferred(self):
        r = P.build_row("534708", SG_Q, SG_SUM, SG_PUB)
        self.assertIsNone(r["fii_pct"])
        self.assertIsNone(r["mf_pct"])
        self.assertEqual((r["promoter_pct"], r["pledge_status"], r["quarter_end"]),
                         (35.01, "none_reported", "2026-09-30"))
        self.assertIn("no_domestic_foreign_split", r["flags"])

    def test_pledge_true_computes_from_filed_counts(self):
        a = dict(CG_T1[0], Fld_PledgeEncumberedNoOfShares=88766534.5)
        r = P.build_row("500093", CG_Q, {"Table": [{"Fld_IsPledge": True}], "Table1": [a] + CG_T1[1:]}, CG_PUB)
        self.assertEqual((r["pledge_status"], r["pledge_pct"]), ("pledged", 10.0))

    def test_pledge_true_without_count_fails_closed(self):
        r = P.build_row("500093", CG_Q, {"Table": [{"Fld_IsPledge": True}], "Table1": CG_T1}, CG_PUB)
        self.assertIsNone(r["pledge_pct"])
        self.assertIn("pledge_flag_true_no_count", r["flags"])

    def test_inconsistent_percent_vs_counts_nulled(self):
        bad = {"Table": [{"Fld_IsPledge": False}], "Table1": [dict(CG_T1[0], **{PCT: 30.0})] + CG_T1[1:]}
        self.assertIsNone(P.build_row("500093", CG_Q, bad, CG_PUB)["promoter_pct"])

    def test_missing_public_table(self):
        r = P.build_row("500093", CG_Q, CG_SUM, None)
        self.assertIsNone(r["fii_pct"])
        self.assertIn("public_table_missing", r["flags"])

    def test_quarter_end(self):
        self.assertEqual(P.quarter_end("Sep-26"), "2026-09-30")
        self.assertIsNone(P.quarter_end("July 2026"))


if __name__ == "__main__":
    unittest.main()
