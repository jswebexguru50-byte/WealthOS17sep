import sqlite3
import unittest

from management_claims import detect_candidates, ensure_schema
from red_flags import evaluate


class PracticalFereTests(unittest.TestCase):
    def test_missing_values_do_not_create_flags(self):
        self.assertEqual(evaluate({'current': {'pat': 100}, 'prior': {}, 'evidence': []}), [])

    def test_receivable_stress_is_deterministic(self):
        flags = evaluate({'current': {'revenue': 118, 'receivables': 154},
                          'prior': {'revenue': 100, 'receivables': 100}, 'evidence': []})
        self.assertEqual(flags[0]['rule'], 'RECEIVABLE_STRESS')
        self.assertFalse(flags[0]['fraud_inference'])

    def test_claim_detection_requires_metric_action_and_number(self):
        rows = detect_candidates('We expect capacity to reach 2 GW by FY27. General optimism remains high.')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['metric'], 'capacity')
        self.assertEqual(rows[0]['target'], 2.0)

    def test_only_reviewed_claims_have_live_table(self):
        con = sqlite3.connect(':memory:')
        ensure_schema(con)
        count = con.execute('SELECT COUNT(*) FROM management_commitment').fetchone()[0]
        self.assertEqual(count, 0)


if __name__ == '__main__':
    unittest.main()
