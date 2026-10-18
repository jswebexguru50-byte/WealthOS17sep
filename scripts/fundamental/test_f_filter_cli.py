import json
import os
import subprocess
import sys
import unittest

CLI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "f_filter_cli.py")

SAMPLES = [
    {"pats": [5, 4, 3, 2, 1, 1, 1, 1], "promoter_pct": 70, "pledge_pct": 0, "roce": 40,
     "roe": 30, "fii_pct": 3, "dii_pct": 4, "inst_change_pp": 0.5, "cfo": 60, "ebitda": 100},
    {"pats": [5, -1, 3, 2, 1, 1, 1, 1], "promoter_pct": 50, "pledge_pct": 5, "roce": 10, "roe": 5},
    {},
]


def run(items):
    p = subprocess.run([sys.executable, CLI], input=json.dumps(items).encode(),
                       capture_output=True, check=True)
    return json.loads(p.stdout)


class CliTest(unittest.TestCase):
    def test_round_trip(self):
        out = run(SAMPLES)
        self.assertEqual(len(out), 3)
        self.assertTrue(out[0]["all_pass"])
        self.assertIs(out[1]["F2_pass"], False)
        self.assertIs(out[1]["F1_pass"], False)
        self.assertFalse(out[2]["all_pass"])
        self.assertIn("F1", out[2]["unknown"])
        self.assertIsNone(out[2]["F5_pass"])

    def test_deterministic_and_empty(self):
        self.assertEqual(run(SAMPLES), run(SAMPLES))
        self.assertEqual(run([]), [])


if __name__ == "__main__":
    unittest.main()
