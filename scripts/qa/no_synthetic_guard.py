#!/usr/bin/env python3
"""Zero-synthetic-data guard. Stdlib only, deterministic, no LLM.

Usage:
  python scripts/qa/no_synthetic_guard.py [--json] [--root DIR] [--allowlist FILE] [PATH_OR_GLOB ...]
  python scripts/qa/no_synthetic_guard.py --runtime-check portfolio.db [--json]
Exit 1 on any non-allowlisted hit. Test files are auto-excluded.
Allowlist (scripts/qa/allowlist.json): {"entries": [{"file": "rel/path", "line": N|null,
  "rule": "RULE"|null, "justification": "required"}]}  (line/rule null = wildcard).
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys

DEFAULT_SCOPE = [
    "scripts/fundamental/**", "run_scan_dossier.py", "fetch_tv_universe.py",
    "src/server/routes/trendlyneMcp.ts", "src/server/services/enrichment/trendlyne/**",
    "src/server/database.ts", "src/server/services/**Fundamental*",
    "src/server/services/**Shareholding*", "src/server/services/**Opportunity*",
]
EXTS = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs"}
FIN = (r"(?:pledg\w*|roce|roe|pat|price|ltp|close|mcap|market_?cap|promoter\w*|fii\w*|dii\w*|"
       r"sales|revenue|cfo|opm|profit\w*|equity|borrow\w*|assets|holding\w*)")

SYNTH_RX = re.compile(r"(?<![A-Za-z])(?:[Ss]imulat|SIMULAT|[Pp]laceholder|PLACEHOLDER|[Mm]ock|MOCK|[Ff]ake|FAKE|[Dd]ummy|DUMMY|[Ss]ynthetic|SYNTHETIC)|(?:Simulat|Placeholder|Mock|Fake|Dummy|Synthetic)")
RULES = [
    ("SYNTH_WORD", SYNTH_RX),
    ("GEN_REALISTIC", re.compile(r"generate_?realistic\w*", re.I)),
    ("RANDOM", re.compile(r"Math\.random\s*\(|\brandom\.(?:random|uniform|randint|choice|gauss|normalvariate|sample|shuffle)\s*\(|\bnp\.random\.|\bnumpy\.random\.", re.I)),
    # Python: <fin-ish expr> or 0
    ("DEFAULT_ZERO", re.compile(r"(?:\.get\(\s*['\"]\w*" + FIN + r"\w*['\"]\s*\)|\b\w*" + FIN + r"\w*\b)\s+or\s+0(?:\.0)?\b(?!\.\d)", re.I)),
    # TS/JS: <fin-ish> ?? 0 / || 0
    ("DEFAULT_ZERO", re.compile(r"\b\w*" + FIN + r"\w*\b\s*(?:\)|\])?\s*(?:\?\?|\|\|)\s*0(?:\.0)?\b(?!\.\d)", re.I)),
    ("DEFAULT_ZERO", re.compile(r"\b0(?:\.0)?\s+as\s+(?:number|any)\b", re.I)),
    ("DEFAULT_ZERO", re.compile(r"\btypeof\b[^?\n]*===?\s*['\"]number['\"]\s*\?[^:\n]*:\s*0\b")),
    # hard-coded value returned per named param: if (param === 'x') return 12.5;
    ("HARDCODED_RETURN", re.compile(r"\bif\s*\(\s*\w+\s*===?\s*['\"][A-Za-z_]+['\"]\s*\)\s*return\s+-?\d+(?:\.\d+)?\s*;")),
    ("SAMPLE_VALUE", re.compile(r"\b(?:price|ltp|close|currentprice|promoter\w*|pledge\w*|fii\w*|dii\w*)\w*\s*:\s*-?\d+\.\d+\s*,?\s*(?://.*)?$", re.I)),
]
SAMPLE_SYMBOL = re.compile(
    r"""(?:symbols?|tickers?|stock_?codes?)\s*[:=]\s*\[\s*['"](?:RELIANCE|TCS|INFY|HDFCBANK|SAMPLE\w*|TEST\w*|ABC|XYZ)['"]""",
    re.I)
COMMENT_ONLY = re.compile(r"^\s*(#|//|\*|/\*)")
FLAGGED_VALUE_RE = re.compile(r"\b(simulated?|placeholder|mock\w*|fake\w*|dummy|synthetic)\b", re.I)
BAD_SOURCES = ("simulated", "mock", "placeholder", "synthetic")


def is_test(rel):
    p = "/" + rel.replace("\\", "/").lower()
    b = os.path.basename(p)
    return ("/tests/" in p or "/__tests__/" in p or b.startswith("test_") or b.endswith("_test.py")
            or ".test." in b or ".spec." in b or b.startswith("conftest"))


def expand(root, scope):
    files = set()
    for pat in scope:
        pat = pat.replace("\\", "/")
        cands = glob.glob(os.path.join(root, pat), recursive=True)
        if "**" in pat and not pat.endswith("**"):
            cands += glob.glob(os.path.join(root, pat.replace("**", "**/*")), recursive=True)
        for c in cands:
            if os.path.isfile(c):
                if os.path.splitext(c)[1].lower() in EXTS:
                    files.add(os.path.relpath(c, root).replace("\\", "/"))
            elif os.path.isdir(c):
                for dp, _, fns in os.walk(c):
                    for fn in fns:
                        if os.path.splitext(fn)[1].lower() in EXTS:
                            files.add(os.path.relpath(os.path.join(dp, fn), root).replace("\\", "/"))
    return sorted(f for f in files if not is_test(f) and "node_modules" not in f and "__pycache__" not in f)


def scan_text(rel, text):
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        if len(line) > 2000:
            continue
        comment = bool(COMMENT_ONLY.match(line))
        seen = set()
        for rule, rx in RULES:
            if rule in seen or not rx.search(line):
                continue
            if comment:
                continue  # comments cannot produce values
            seen.add(rule)
            hits.append({"file": rel, "line": i, "rule": rule, "text": line.strip()[:160]})
        if not comment and SAMPLE_SYMBOL.search(line):
            hits.append({"file": rel, "line": i, "rule": "SAMPLE_SYMBOL", "text": line.strip()[:160]})
    return hits


def scan_v16(root):
    """database.ts: only the v16 migration block is in scope."""
    rel = "src/server/database.ts"
    path = os.path.join(root, rel)
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    start = next((i for i, l in enumerate(lines) if "MIGRATION_V16_SQLS" in l and "function" in l), None)
    if start is None:
        return []
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("}"):
            end = j + 1
            break
    out = []
    for h in scan_text(rel, "\n".join(lines[start:end])):
        h["line"] += start
        out.append(h)
    return out


def load_allow(path):
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", []) if isinstance(data, dict) else data
    return [e for e in entries if str(e.get("justification", "")).strip()]


def allowed(hit, allow):
    for e in allow:
        if str(e.get("file", "")).replace("\\", "/") != hit["file"]:
            continue
        if e.get("line") not in (None, hit["line"]):
            continue
        if e.get("rule") not in (None, hit["rule"]):
            continue
        return True
    return False


def runtime_check(db_path):
    hits = []
    uri = "file:" + os.path.abspath(db_path).replace("\\", "/") + "?mode=ro"
    con = sqlite3.connect(uri, uri=True)
    try:
        if not con.execute("SELECT 1 FROM sqlite_master WHERE name='canonical_fact_store'").fetchone():
            return [{"file": db_path, "line": 0, "rule": "TABLE_MISSING", "text": "canonical_fact_store not found"}]
        for sym, field, value, source in con.execute("SELECT symbol, field, value, source FROM canonical_fact_store"):
            s = (source or "").strip().lower()
            if any(b in s for b in BAD_SOURCES):
                hits.append({"file": "canonical_fact_store", "line": 0, "rule": "BAD_SOURCE",
                             "text": "%s.%s source=%r" % (sym, field, source)})
            elif value is not None and FLAGGED_VALUE_RE.search(str(value)):
                hits.append({"file": "canonical_fact_store", "line": 0, "rule": "FLAGGED_VALUE",
                             "text": "%s.%s value=%r" % (sym, field, str(value)[:80])})
    finally:
        con.close()
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    ap.add_argument("--allowlist", default=None)
    ap.add_argument("--runtime-check", metavar="DB")
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    allow_path = a.allowlist or os.path.join(os.path.dirname(os.path.abspath(__file__)), "allowlist.json")
    allow = load_allow(allow_path)
    if a.runtime_check:
        raw = runtime_check(a.runtime_check)
    else:
        raw = []
        for rel in expand(a.root, a.paths or DEFAULT_SCOPE):
            if not a.paths and rel == "src/server/database.ts":
                continue  # default scope: only the v16 block, handled below
            with open(os.path.join(a.root, rel), encoding="utf-8", errors="replace") as f:
                raw += scan_text(rel, f.read())
        if not a.paths:
            raw += scan_v16(a.root)
    viol = [h for h in raw if not allowed(h, allow)]
    if a.json:
        print(json.dumps({"violations": viol, "allowlisted": len(raw) - len(viol)}, indent=2))
    else:
        for h in viol:
            print("%s:%s: [%s] %s" % (h["file"], h["line"], h["rule"], h["text"]))
        print("%d violation(s), %d allowlisted" % (len(viol), len(raw) - len(viol)))
    return 1 if viol else 0


if __name__ == "__main__":
    sys.exit(main())
