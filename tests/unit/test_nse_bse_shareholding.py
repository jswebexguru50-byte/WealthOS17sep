"""Tests use trimmed excerpts of REAL NSE responses captured 2026-10-18 (tests/fixtures/shp)."""
import importlib.util
import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = ROOT / "tests" / "fixtures" / "shp"
_s = importlib.util.spec_from_file_location("nse_bse_shareholding", ROOT / "scripts" / "fundamental" / "nse_bse_shareholding.py")
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)


def fx(name):
    return (FX / name).read_bytes()


def test_new_schema_fraction_scale_and_pledge_from_counts():
    r = m.parse_shp_xbrl(fx("jppower_2026-06-30_new_pledged.xml"), anchor_promoter_pct=24.0)
    assert r["promoter_pct"] == 24.0 and r["public_pct"] == 76.0
    assert r["pledged_shares"] == 1200509465 and r["promoter_shares"] == 1644830118
    assert abs(r["pledge_pct"] - 72.99) < 0.01 and r["pledge_status"] == "pledged"
    assert r["pledge_basis"] == "pledged" and r["flags"] == []


def test_old_schema_percent_scale_and_encumbered_basis():
    r = m.parse_shp_xbrl(fx("adanient_2024-03-31_old_pledged.xml"), anchor_promoter_pct=72.61)
    assert r["promoter_pct"] == 72.61 and r["fii_pct"] == 14.41 and r["dii_pct"] == 5.77 and r["mf_pct"] == 1.71
    assert abs(r["pledge_pct"] - 671000 / 827750953 * 100) < 1e-3
    assert r["pledge_basis"] == "pledged_or_encumbered"


def test_flag_false_is_explicit_zero_not_null():
    r = m.parse_shp_xbrl(fx("reliance_2026-06-30_new_no_pledge.xml"), anchor_promoter_pct=50.48)
    assert r["pledge_pct"] == 0.0 and r["pledge_status"] == "none_reported"
    assert r["fii_pct"] == 17.2 and r["dii_pct"] == 21.19 and r["mf_pct"] == 10.11


def test_pledge_pct_is_of_promoter_not_of_total():
    r = m.parse_shp_xbrl(fx("adanient_2026-09-30_new_pledged.xml"), anchor_promoter_pct=71.97)
    assert abs(r["pledge_pct"] - 7700000 / 974234554 * 100) < 1e-3


def test_unit_unverifiable_refuses_values():
    # Reliance: filed promoter share count / total shares = 49.63 but filed pct 0.5048 (different denominator);
    # only the index anchor 50.48 can confirm the fraction scale. A wrong anchor must yield null, never a guess.
    ok = m.parse_shp_xbrl(fx("reliance_2026-06-30_new_no_pledge.xml"), anchor_promoter_pct=50.48)
    assert ok["promoter_pct"] == 50.48
    r2 = m.parse_shp_xbrl(fx("reliance_2026-06-30_new_no_pledge.xml"), anchor_promoter_pct=12.0)
    assert r2["promoter_pct"] is None and r2["fii_pct"] is None and "unit_unverified" in r2["flags"]


def test_bad_xml_and_missing_pledge_stay_null():
    assert m.parse_shp_xbrl(b"not xml")["flags"] == ["bad_xml"]
    r = m.parse_shp_xbrl(b'<x xmlns:xbrli="a" xmlns:in="b"><in:Other>1</in:Other></x>')
    assert r["pledge_pct"] is None and r["pledge_status"] == "unknown"


def test_index_quarter_dedupe_and_order():
    rows = json.loads(fx("index_ntpc_head.json"))
    dup = dict(rows[1])  # same period re-filed later (revision): latest broadcast wins
    dup["broadcastDate"] = "30-AUG-2026 10:00:00"
    dup["xbrl"] = "https://x/rev.xml"
    off = dict(rows[0])
    off["date"] = "07-JUL-2026"  # non quarter-end date is ignored
    out = m.parse_index(json.dumps(rows + [dup, off]))
    assert [r["quarter_end"] for r in out] == ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30"]
    assert out[1]["xbrl"] == "https://x/rev.xml"
    assert out[0]["promoter_pct"] == 51.1 and out[0]["symbol"] == "NTPC"


def test_empty_index_valid_json():
    assert m.parse_index("[]") == []


def test_fetcher_cache_is_gzip_and_rerun_free(tmp_path):
    class Op:
        n = 0

        def open(self, req, timeout=0):
            Op.n += 1

            class R:
                def read(self_inner):
                    return b'{"data": [1,2,3,4,5,6,7,8,9,10,11,12]}'
            return R()
    f = m.Fetcher(str(tmp_path), delay=1.0, opener=Op(), warm_urls=())
    assert f.get("http://u/a") == f.get("http://u/a") and Op.n == 1 and f.cache_hits == 1


def test_delay_floor_is_one_second(tmp_path):
    assert m.Fetcher(str(tmp_path), delay=0.1, warm_urls=()).delay == 1.0


def test_stage_resume_and_apply_dry_run(tmp_path):
    st = tmp_path / "s.jsonl"
    rec = {"symbol": "A", "quarter_end": "2026-06-30", "promoter_pct": 50.0, "fii_pct": None, "dii_pct": None,
           "mf_pct": None, "public_pct": 50.0, "pledge_pct": 0.0, "pledged_shares": 0, "promoter_shares": 1,
           "total_shares": 2, "pledge_status": "none_reported", "pledge_basis": "pledged", "flags": [],
           "source": m.SOURCE_XBRL, "source_url": "http://u", "filing_date": "2026-07-10", "fetched_at": "t"}
    st.write_text(json.dumps(rec) + "\n")
    assert m.read_done(str(st)) == {("A", "2026-06-30")}
    db = tmp_path / "t.db"
    sqlite3.connect(db).close()
    assert m.apply_stage(str(db), str(st), yes=False, log=lambda *_: None) == 0
    c = sqlite3.connect(db)
    assert c.execute("select count(*) from sqlite_master where name='ShareholdingOfficial'").fetchone()[0] == 0
    m.apply_stage(str(db), str(st), yes=True, log=lambda *_: None)
    assert c.execute("select pledge_pct, source from ShareholdingOfficial").fetchone() == (0.0, m.SOURCE_XBRL)
    assert c.execute("select fii_pct from ShareholdingOfficial").fetchone()[0] is None


def test_apply_requires_explicit_db():
    assert m.main(["--apply"]) == 2
