import copy
import importlib.util
import math
import pathlib

_p = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "fundamental" / "f_filter_engine.py"
_spec = importlib.util.spec_from_file_location("f_filter_engine", _p)
fe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fe)
ev = fe.evaluate_f_filters

GOOD = dict(pats=[5] * 8, promoter_pct=70, pledge_pct=0, roce=40, roe=30,
            fii_pct=3, dii_pct=4, inst_change_pp=0.5, cfo_ebitda=0.8)


def test_all_pass():
    r = ev(GOOD)
    assert r["all_pass"] is True and r["unknown"] == [] and r["fail"] == []


def test_empty_all_unknown():
    r = ev({})
    assert r["all_pass"] is False and r["unknown"] == list(fe.F_NAMES) and r["fail"] == []
    assert ev(None)["all_pass"] is False


def test_f1_boundary():
    assert ev({"promoter_pct": 66.67})["F1_pass"] is True
    assert ev({"promoter_pct": 66.66})["F1_pass"] is False
    assert ev({"promoter_pct": float("nan")})["F1_pass"] is None


def test_f2_quarters():
    assert ev({"pats": [1] * 7})["F2_pass"] is None
    assert ev({"pats": [1] * 8})["F2_pass"] is True
    assert ev({"pats": [1] * 9})["F2_pass"] is True
    assert ev({"pats": [1] * 8 + [-5]})["F2_pass"] is True  # 9th ignored
    assert ev({"pats": [1] * 7 + [0]})["F2_pass"] is False
    assert ev({"pats": [1] * 3 + [-1] + [1] * 6})["F2_pass"] is False
    assert ev({"pats": [1] * 7 + [None]})["F2_pass"] is None
    assert ev({"pats": [None, -1] + [1] * 6})["F2_pass"] is False
    assert ev({"pats": []})["F2_pass"] is None
    assert ev({})["F2_pass"] is None


def test_f3_f4_boundaries():
    assert ev({"roce": 35})["F3_pass"] is True
    assert ev({"roce": 34.99})["F3_pass"] is False
    assert ev({"roe": 25})["F4_pass"] is True
    assert ev({"roe": 24.9})["F4_pass"] is False
    assert ev({"roe": None})["F4_pass"] is None


def test_f5_pledge():
    assert ev({})["F5_pass"] is None
    assert ev({"pledge_pct": None})["F5_pass"] is None
    assert ev({"pledge_pct": 0})["F5_pass"] is True
    assert ev({"pledge_pct": 0.01})["F5_pass"] is True
    assert ev({"pledge_pct": 0.02})["F5_pass"] is False
    assert ev({"pledge_pct": 25})["F5_pass"] is False
    r = ev({**GOOD, "pledge_pct": None})
    assert r["all_pass"] is False and r["unknown"] == ["F5"]


def test_f6():
    assert ev({"fii_pct": 2, "dii_pct": 3, "inst_change_pp": 0.10})["F6_pass"] is True
    assert ev({"fii_pct": 2, "dii_pct": 3, "inst_change_pp": 0.09})["F6_pass"] is True
    assert ev({"fii_pct": 2, "dii_pct": 2.9, "inst_change_pp": 5})["F6_pass"] is False
    assert ev({"fii_pct": 2, "dii_pct": 3})["F6_pass"] is True
    assert ev({"fii_pct": 2, "dii_pct": 2, "inst_change_pp": None})["F6_pass"] is False
    assert ev({"fii_pct": 9})["F6_pass"] is None  # dii missing, not treated as 0
    assert ev({"inst_pct": 6, "inst_change_pp": 1})["F6_pass"] is True
    assert ev({"fii_pct": 2, "dii_pct": 3})["F6_value"] == 5


def test_f7():
    assert ev({"cfo_ebitda": 0.5})["F7_pass"] is True
    assert ev({"cfo_ebitda": 0.49})["F7_pass"] is False
    assert ev({"cfo": 50, "ebitda": 100})["F7_pass"] is True
    assert ev({"cfo": 40, "ebitda": 100})["F7_pass"] is False
    assert ev({"cfo": 10, "ebitda": 0})["F7_pass"] is False
    assert ev({"cfo": 10, "ebitda": -5})["F7_pass"] is False
    assert ev({"cfo": 10})["F7_pass"] is None


def test_all_pass_logic_and_lists():
    r = ev({**GOOD, "roe": 10, "pats": [1] * 5})
    assert r["unknown"] == ["F2"] and r["fail"] == ["F4"] and r["all_pass"] is False
    r = ev({**GOOD, "promoter_pct": None, "roe": 10})
    assert r["unknown"] == ["F1"] and r["fail"] == ["F4"]


def test_pure_and_deterministic():
    d = copy.deepcopy(GOOD)
    a, b = ev(d), ev(d)
    assert a == b and d == GOOD


def test_roce_trailing_4q():
    assert math.isclose(fe.roce_trailing_4q([10, 10, 10, 10, 99], 100), 40.0)
    assert fe.roce_trailing_4q([10, 10, 10], 100) is None
    assert fe.roce_trailing_4q([10, None, 10, 10], 100) is None
    assert fe.roce_trailing_4q([10] * 4, 0) is None
    assert fe.roce_trailing_4q([10] * 4, None) is None
