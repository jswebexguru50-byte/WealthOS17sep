import unittest

from formulas import (altman_z_public_manufacturing, beneish_m,
                      cash_conversion_cycle, cfo_to_ebitda,
                      piotroski_f, sloan_accrual)


class StrictFormulaTests(unittest.TestCase):
    def test_missing_inputs_never_publish(self):
        for formula in (altman_z_public_manufacturing, beneish_m,
                        cash_conversion_cycle, cfo_to_ebitda,
                        piotroski_f, sloan_accrual):
            result = formula({})
            self.assertEqual(result['status'], 'DATA_INSUFFICIENT')
            self.assertIsNone(result['value'])
            self.assertTrue(result['missing_fields'])

    def test_zero_is_an_observation_not_a_missing_value(self):
        result = cfo_to_ebitda({'cfo_c': 0.0, 'ebitda_c': 10.0})
        self.assertEqual(result['status'], 'VERIFIED')
        self.assertEqual(result['value'], 0.0)

    def test_hand_calculated_sloan(self):
        result = sloan_accrual({'pat_c': 15.0, 'cfo_c': 10.0,
                                'assets_c': 120.0, 'assets_p': 80.0})
        self.assertEqual(result['status'], 'VERIFIED')
        self.assertEqual(result['value'], 0.05)

    def test_altman_requires_observed_market_value(self):
        result = altman_z_public_manufacturing({
            'working_capital_c': 10.0, 'retained_earnings_c': 20.0,
            'ebit_c': 15.0, 'total_liabilities_c': 50.0,
            'sales_c': 100.0, 'assets_c': 100.0})
        self.assertEqual(result['status'], 'DATA_INSUFFICIENT')
        self.assertIn('market_value_equity_c', result['missing_fields'])


if __name__ == '__main__':
    unittest.main()
