"""Tests use trimmed excerpts of REAL NSE responses captured 2026-10-18 (tests/fixtures/shp)."""
import importlib.util
import json
import pathlib
import sqlite3
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = ROOT / "tests" / "fixtures" / "shp"
_s = importlib.util.spec_from_file_location("nse_sast_insider", ROOT / "scripts" / "fundamental" / "nse_sast_insider.py")
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)


def test_parse_pit_real_rows():
    ev = m.parse_pit((FX / "pit_dhtl_head.json").read_text())
    assert ev and all(e["kind"] == "PIT_REG7" and e["event_id"] for e in ev)
    e = next(x for x in ev if x["event_id"] == "556328")
    assert e["txn_type"] == "Pledge Invoke" and e["shares_qty"] == 44403 and e["after_pct"] == 16.36
    assert e["filing_date"] == "2025-11-24" and e["event_from"] == "2025-11-21"


def test_parse_sast_real_rows():
    ev = m.parse_sast((FX / "sast_lici_head.json").read_text())
    assert ev and all(e["kind"] == "SAST_REG29" for e in ev)
    assert all(e["person_category"] in ("Promoter", "Non-promoter", None) for e in ev)


def test_dash_and_blank_become_null():
    assert m._n("-") is None and m._s("") is None and m._d("-") is None and m._n("1,234") == 1234.0


def test_window_row_records_zero_events_explicitly():
    class F:
        net_calls = cache_hits = 0

        def get(self, url):
            return b'{"acqNameList": [], "data": []}'
    rows, wins, errs = m.stage_symbol("ZZ", F(), date(2025, 10, 18), date(2026, 10, 18), now="t")
    assert rows == [] and errs == [] and len(wins) == 2
    assert all(w["n_events"] == 0 and w["state"] == "none_disclosed" and w["window_to"] == "2026-10-18" for w in wins)


def test_fetch_failure_is_error_not_zero():
    class F:
        def get(self, url):
            return None
    rows, wins, errs = m.stage_symbol("ZZ", F(), date(2025, 10, 18), date(2026, 10, 18))
    assert wins == [] and len(errs) == 2


def test_apply_dry_run_then_write(tmp_path):
    st = tmp_path / "s.jsonl"
    ev = m.parse_pit((FX / "pit_dhtl_head.json").read_text())[0]
    ev.update({"symbol": "DHTL", "row_type": "event", "source": "NSE_PIT_REG7", "source_url": "u", "fetched_at": "t"})
    win = {"row_type": "window", "symbol": "DHTL", "kind": "PIT_REG7", "window_from": "2025-10-18", "window_to": "2026-10-18",
           "n_events": 1, "n_returned": 1, "state": "events", "source": "NSE_PIT_REG7", "source_url": "u", "fetched_at": "t"}
    st.write_text(json.dumps(ev) + "\n" + json.dumps(win) + "\n")
    db = tmp_path / "t.db"
    sqlite3.connect(db).close()
    m.apply_stage(str(db), str(st), yes=False, log=lambda *_: None)
    c = sqlite3.connect(db)
    assert c.execute("select count(*) from sqlite_master where name like 'SastInsider%'").fetchone()[0] == 0
    m.apply_stage(str(db), str(st), yes=True, log=lambda *_: None)
    assert c.execute("select count(*) from SastInsiderEvents").fetchone()[0] == 1
    assert c.execute("select state from SastInsiderWindows").fetchone()[0] == "events"


def test_apply_requires_explicit_db():
    assert m.main(["--apply"]) == 2
