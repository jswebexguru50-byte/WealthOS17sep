import json
import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "qa"))
import no_synthetic_guard as g  # noqa: E402


def rules(src, name="x.ts"):
    return {h["rule"] for h in g.scan_text(name, src)}


class GuardTests(unittest.TestCase):
    def test_flags_synthetic_words_and_random(self):
        self.assertIn("SYNTH_WORD", rules("const simulatedData = {};"))
        self.assertIn("GEN_REALISTIC", rules("this.generateRealisticParamValue(a,b)"))
        self.assertIn("RANDOM", rules("const v = Math.random() * 10;"))
        self.assertIn("RANDOM", rules("x = random.uniform(1, 2)", "a.py"))

    def test_flags_default_zero(self):
        self.assertIn("DEFAULT_ZERO", rules("pledge = row.get('pledge_pct') or 0", "a.py"))
        self.assertIn("DEFAULT_ZERO", rules("const roce = r.roce ?? 0;"))
        self.assertIn("DEFAULT_ZERO", rules("const v = (x as any) || 0 as number;"))

    def test_flags_hardcoded_return(self):
        self.assertIn("HARDCODED_RETURN", rules("if (param === 'roea') return 16.2;"))

    def test_clean_code_passes(self):
        self.assertEqual(rules("const roce = r.roce ?? null;\nlet n = items.length || 0;"), set())

    def test_cli_exit_codes_allowlist_and_test_exclusion(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "bad.py"), "w") as f:
                f.write("x = 1\nprice = q.get('price') or 0\n")
            with open(os.path.join(d, "test_bad.py"), "w") as f:
                f.write("mock = 1\n")
            al = os.path.join(d, "al.json")
            with open(al, "w") as f:
                json.dump({"entries": []}, f)
            self.assertEqual(g.main(["--root", d, "--allowlist", al, "--json", "bad.py", "test_bad.py"]), 1)
            self.assertEqual(g.expand(d, ["*.py"]), ["bad.py"])
            with open(al, "w") as f:
                json.dump({"entries": [{"file": "bad.py", "line": 2, "rule": "DEFAULT_ZERO",
                                        "justification": "unit test"}]}, f)
            self.assertEqual(g.main(["--root", d, "--allowlist", al, "bad.py"]), 0)
            with open(al, "w") as f:  # entry without justification is ignored
                json.dump({"entries": [{"file": "bad.py", "justification": ""}]}, f)
            self.assertEqual(g.main(["--root", d, "--allowlist", al, "bad.py"]), 1)

    def test_runtime_check(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "t.db")
            con = sqlite3.connect(db)
            con.execute("CREATE TABLE canonical_fact_store (symbol TEXT, field TEXT, value TEXT, source TEXT)")
            con.execute("INSERT INTO canonical_fact_store VALUES ('A','roce','12','trendlyne')")
            con.commit()
            con.close()
            self.assertEqual(g.main(["--runtime-check", db]), 0)
            con = sqlite3.connect(db)
            con.execute("INSERT INTO canonical_fact_store VALUES ('B','pat','1','Simulated')")
            con.execute("INSERT INTO canonical_fact_store VALUES ('C','x','placeholder','nse')")
            con.commit()
            con.close()
            self.assertEqual(len(g.runtime_check(db)), 2)
            self.assertEqual(g.main(["--runtime-check", db]), 1)


if __name__ == "__main__":
    unittest.main()
