import importlib.util
import json
import pathlib
import sqlite3

_p = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "fundamental" / "nse_bse_shareholding.py"
_s = importlib.util.spec_from_file_location("nse_bse_shareholding", _p)
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)


def xml(*pairs):
    body = "".join(f"<in:{k}>{v}</in:{k}>" for k, v in pairs)
    return f'<xbrli:xbrl xmlns:xbrli="x" xmlns:in="y">{body}</xbrli:xbrl>'.encode()


def test_no_encumbrance_flag_is_zero():
    assert m.parse_pledge_xbrl(xml((m.FLAG_TAG, "false")))[0] == 0.0


def test_promoter_basis():
    v, why = m.parse_pledge_xbrl(xml((m.FLAG_TAG, "true"),
                                     ("PledgedOrEncumberedSharesAsPercentageOfPromoterShares", "12.5")))
    assert v == 12.5 and why == "promoter_basis"


def test_total_basis_converted():
    v, why = m.parse_pledge_xbrl(xml(("EncumberedShareUnderPledgedAsPercentageOfTotalNumberOfShares", "10")),
                                 promoter_pct=50)
    assert v == 20.0 and why == "total_basis_converted"


def test_total_basis_without_promoter_unknown():
    assert m.parse_pledge_xbrl(xml(("EncumberedShareUnderPledgedAsPercentageOfTotalNumberOfShares", "10")))[0] is None


def test_out_of_range_and_fail_closed():
    assert m.parse_pledge_xbrl(xml(("PercentageOfSharesPledgedOrOtherwiseEncumbered", "140")))[0] is None
    assert m.parse_pledge_xbrl(xml((m.FLAG_TAG, "true")))[0] is None
    assert m.parse_pledge_xbrl(xml(("Other", "1")))[0] is None
    assert m.parse_pledge_xbrl(b"not xml")[0] is None


def test_master_and_dates():
    t = json.dumps({"data": [
        {"symbol": "abc", "date": "30-Jun-2026", "xbrl": "http://u/1", "pr_and_prgrp": "50.5"},
        {"symbol": "XYZ", "date": "30-Jun-2026", "xbrl": "-"}]})
    r = m.parse_master(t)
    assert r == [{"symbol": "ABC", "as_of": "2026-06-30", "xbrl": "http://u/1", "promoter_pct": 50.5}]


def test_build_updates_filters_by_db_rows():
    items = [{"symbol": "A", "as_of": "2026-06-30", "xbrl": "u1", "promoter_pct": 50},
             {"symbol": "B", "as_of": "2026-06-30", "xbrl": "u2", "promoter_pct": 50}]
    ups, sk = m.build_updates(items, {("A", "2026-06-30")}, lambda u: xml((m.FLAG_TAG, "false")))
    assert ups == [(0.0, "A", "2026-06-30")] and sk == {"no_db_row": 1}


def test_readonly_open_and_column_check(tmp_path):
    db = tmp_path / "t.db"
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE HistoricalShareholdingPattern(symbol TEXT, as_of_date TEXT)")
    c.commit()
    c.close()
    ro = m.open_db(str(db), write=False)
    assert not m.has_column(ro, "HistoricalShareholdingPattern", "pledge_pct")
    try:
        ro.execute("INSERT INTO HistoricalShareholdingPattern VALUES('A','x')")
        assert False
    except sqlite3.OperationalError:
        pass
    assert m.main(["--db", str(db), "--cache-dir", str(tmp_path / "c"), "--apply",
                   "--master-file", str(tmp_path / "none.json")]) == 2
