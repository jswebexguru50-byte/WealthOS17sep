import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xbrl_financials_ingest as x  # noqa: E402

XML = b"""<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:f="http://x/fin">
<xbrli:context id="OneD"><xbrli:entity><xbrli:identifier scheme="s">ABC</xbrli:identifier></xbrli:entity>
 <xbrli:period><xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="OneI"><xbrli:entity><xbrli:identifier scheme="s">ABC</xbrli:identifier></xbrli:entity>
 <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
<f:Symbol contextRef="OneD">ABC</f:Symbol>
<f:ISIN contextRef="OneD">INE000A01010</f:ISIN>
<f:NatureOfReportStandaloneConsolidated contextRef="OneD">Consolidated</f:NatureOfReportStandaloneConsolidated>
<f:RevenueFromOperations contextRef="OneD" unitRef="INR">10000000000</f:RevenueFromOperations>
<f:Expenses contextRef="OneD" unitRef="INR">9000000000</f:Expenses>
<f:FinanceCosts contextRef="OneD" unitRef="INR">500000000</f:FinanceCosts>
<f:DepreciationDepletionAndAmortisationExpense contextRef="OneD" unitRef="INR">400000000</f:DepreciationDepletionAndAmortisationExpense>
<f:Assets contextRef="OneI" unitRef="INR">70000000000</f:Assets>
<f:BorrowingsNoncurrent contextRef="OneI" unitRef="INR">2000000000</f:BorrowingsNoncurrent>
<f:BorrowingsCurrent contextRef="OneI" unitRef="INR">1000000000</f:BorrowingsCurrent>
</xbrli:xbrl>"""
DOC = {"isin": "INE000A01010", "symbol": "ABC", "period_end": "2025-12-31", "statement_scope": None,
       "filing_id": 1, "sha256": "h", "source_url": "u", "filing_timestamp": "2026-01-20T00:00:00+05:30"}


class IngestTest(unittest.TestCase):
    def setUp(self):
        facts, why = x.parse_filing(XML, DOC)
        self.assertIsNone(why)
        rows = [r for r in (x.to_stage_row(f, DOC) for f in facts) if r]
        self.rows = rows + x.derive_in_filing(rows, DOC)
        self.by = {(r["metric"], r["period_type"]): r for r in self.rows}

    def test_unit_normalised_to_crore(self):
        r = self.by[("sales", "Q")]
        self.assertEqual(r["raw_value"], 1e10)
        self.assertAlmostEqual(r["value"], 1000.0)  # 1e10 rupees = 1000 crore
        self.assertEqual(r["unit_normalised_to"], "INR_crore")
        self.assertEqual(r["raw_unit"], "INR")
        self.assertEqual(r["scope"], "CONSOLIDATED")

    def test_balance_sheet_instants_keep_scope(self):
        self.assertAlmostEqual(self.by[("total_assets", "INSTANT")]["value"], 7000.0)
        self.assertEqual(self.by[("total_assets", "INSTANT")]["scope"], "CONSOLIDATED")

    def test_operating_profit_and_borrowings_derived_only_from_inputs(self):
        # 1000 - (900 - 50 - 40) = 190 crore
        self.assertAlmostEqual(self.by[("operating_profit", "Q")]["value"], 190.0)
        self.assertAlmostEqual(self.by[("borrowings", "INSTANT")]["value"], 300.0)
        self.assertNotIn(("pat", "Q"), self.by)  # absent in filing -> absent, never zero

    def test_identity_mismatch_rejected(self):
        _, why = x.parse_filing(XML, dict(DOC, isin="INE999Z01019"))
        self.assertEqual(why, "isin_mismatch")

    def test_period_type(self):
        self.assertEqual(x.period_type("2025-10-01", "2025-12-31"), "Q")
        self.assertEqual(x.period_type("2024-04-01", "2025-03-31"), "FY")
        self.assertEqual(x.period_type(None, "2025-03-31"), "INSTANT")


if __name__ == "__main__":
    unittest.main()
