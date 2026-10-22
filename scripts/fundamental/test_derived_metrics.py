import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import derived_metrics as d  # noqa: E402


class DerivedMetricsTest(unittest.TestCase):
    def test_ttm(self):
        self.assertEqual(d.ttm([10, 20, 30, 40]), 100.0)
        self.assertIsNone(d.ttm([10, 20, 30]))
        self.assertIsNone(d.ttm([10, None, 30, 40]))

    def test_operating_profit_and_ebit(self):
        # 1000 - (900 - 50 - 40) = 190
        self.assertEqual(d.operating_profit(1000, 900, 50, 40), 190.0)
        self.assertIsNone(d.operating_profit(1000, None, 50, 40))
        self.assertEqual(d.ebit(120, 30), 150.0)
        self.assertIsNone(d.ebit(None, 30))

    def test_roce(self):
        # TTM EBIT 100 / (900-100)=800 -> 12.5%
        self.assertAlmostEqual(d.roce_ttm_pct([25, 25, 25, 25], 900, 100), 12.5)
        self.assertIsNone(d.roce_ttm_pct([25, 25, 25], 900, 100))
        self.assertIsNone(d.roce_ttm_pct([25, 25, 25, 25], 100, 100))  # CE = 0
        self.assertIsNone(d.roce_ttm_pct([25, 25, 25, 25], None, 100))

    def test_roe(self):
        # 90 / avg(400,500)=450 -> 20%
        self.assertAlmostEqual(d.roe_pct(90, 400, 500), 20.0)
        self.assertIsNone(d.roe_pct(90, None, 500))
        self.assertIsNone(d.roe_pct(90, -500, 400))  # avg <= 0

    def test_cfo_ebitda(self):
        self.assertAlmostEqual(d.cfo_to_ebitda(80, 100), 0.8)
        self.assertIsNone(d.cfo_to_ebitda(80, 0))
        self.assertIsNone(d.cfo_to_ebitda(80, -5))
        self.assertIsNone(d.cfo_to_ebitda(None, 100))

    def test_cagr(self):
        # 100 -> 161.051 over 5y = 10%
        self.assertAlmostEqual(d.sales_cagr_pct(100, 161.051, 5), 10.0, places=3)
        self.assertIsNone(d.sales_cagr_pct(0, 100, 5))
        self.assertIsNone(d.sales_cagr_pct(None, 100, 5))

    def test_piotroski(self):
        prev = dict(pat=40, cfo=50, total_assets=500, long_term_debt=100, current_assets=200,
                    current_liabilities=100, shares=10, sales=400, gross_profit=120)
        cur = dict(pat=60, cfo=80, total_assets=520, long_term_debt=80, current_assets=260,
                   current_liabilities=100, shares=10, sales=500, gross_profit=175)
        # all 9 signals pass: ROA .115>.08, CFO>0, dROA, 80>60, 80/520<100/500,
        # 2.6>2.0, 10<=10, .35>.30, .9615>.8
        self.assertEqual(d.piotroski_f(cur, prev), 9)
        worse = dict(cur, pat=-5, cfo=-10, shares=12)  # fails 1,2,3,7; CFO>PAT (-10>-5) fails too
        self.assertEqual(d.piotroski_f(worse, prev), 4)  # signals 5,6,8,9 pass
        bad = dict(cur)
        bad["gross_profit"] = None
        self.assertIsNone(d.piotroski_f(bad, prev))

    def test_altman(self):
        # TA=1000: 1.2*0.1 + 1.4*0.2 + 3.3*0.15 + 0.6*(600/400) + 1.0*1.2
        # = 0.12+0.28+0.495+0.9+1.2 = 2.995
        z = d.altman_z(100, 200, 150, 600, 400, 1200, 1000)
        self.assertAlmostEqual(z, 2.995)
        self.assertIsNone(d.altman_z(100, None, 150, 600, 400, 1200, 1000))
        self.assertIsNone(d.altman_z(100, 200, 150, 600, 0, 1200, 1000))
        self.assertTrue(math.isfinite(z))


if __name__ == "__main__":
    unittest.main()
