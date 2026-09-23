"""Compact filing-backed FERE company checker. Missing values remain missing."""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from typing import Any

from management_claims import due_commitments, ensure_schema as ensure_claim_schema
from red_flags import evaluate, growth, thresholds_dict
from verified_filing_pipeline import connect

BASE_METRICS = ("sales", "pat", "cfo", "debt", "cash", "receivables", "inventory",
                "promoter_holding", "promoter_pledge")


def ensure_schema(con: sqlite3.Connection) -> None:
    ensure_claim_schema(con)
    con.executescript('''
      CREATE TABLE IF NOT EXISTS company_check_state (
        isin TEXT PRIMARY KEY, symbol TEXT NOT NULL, last_filing_id INTEGER,
        last_result_period TEXT, last_shareholding_filing TEXT,
        last_management_communication TEXT, last_credit_rating_update TEXT,
        checked_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS company_check_result (
        isin TEXT PRIMARY KEY, symbol TEXT NOT NULL, status TEXT NOT NULL,
        period_end TEXT, previous_period_end TEXT, updated_at TEXT NOT NULL,
        result_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS company_material_event (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        event_type TEXT NOT NULL, event_date TEXT NOT NULL, severity TEXT NOT NULL,
        explanation TEXT NOT NULL, source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        verified INTEGER NOT NULL CHECK(verified IN (0,1)),
        UNIQUE(isin,event_type,event_date,source_sha256));
    ''')


def latest_checkpoint(con: sqlite3.Connection, isin: str) -> tuple[int, str | None, str | None, str | None]:
    row = con.execute('SELECT COALESCE(MAX(id),0),MAX(period_end) FROM filing_document WHERE isin=? AND sha256 IS NOT NULL', (isin,)).fetchone()
    management = con.execute('SELECT MAX(claim_date) FROM management_commitment WHERE isin=?', (isin,)).fetchone()[0]
    credit = con.execute("SELECT MAX(event_date) FROM company_material_event WHERE isin=? AND event_type='CREDIT_RATING_DOWNGRADE'", (isin,)).fetchone()[0]
    return int(row[0]), row[1], management, credit


def annual_periods(con: sqlite3.Connection, isin: str) -> list[tuple[str, str, str]]:
    rows = con.execute('''SELECT DISTINCT period_start,period_end,scope FROM verified_xbrl_fact
      WHERE isin=? AND period_start IS NOT NULL ORDER BY period_end DESC''', (isin,)).fetchall()
    return [r for r in rows if 330 <= (date.fromisoformat(r[1])-date.fromisoformat(r[0])).days <= 380]


def period_values(con: sqlite3.Connection, isin: str, period: tuple[str, str, str]) -> tuple[dict, list[dict]]:
    con.row_factory = sqlite3.Row
    rows = con.execute('''SELECT id,metric,value,unit,source_url,filing_sha256,available_at,taxonomy_field
      FROM verified_xbrl_fact WHERE isin=? AND period_start=? AND period_end=? AND scope=?
      ORDER BY available_at DESC,id DESC''', (isin, *period)).fetchall()
    selected: dict[str, sqlite3.Row] = {}
    for row in rows:
        selected.setdefault(row["metric"], row)
    values = {metric: float(row["value"]) for metric, row in selected.items()}
    if all(k in values for k in ("pbt", "finance_costs", "depreciation")):
        values["ebitda"] = values["pbt"] + values["finance_costs"] + values["depreciation"]
    values["revenue"] = values.get("sales")
    if values.get("revenue") not in (None, 0) and values.get("ebitda") is not None:
        values["ebitda_margin"] = values["ebitda"] / values["revenue"]
    if values.get("pat") not in (None, 0) and values.get("cfo") is not None:
        values["cfo_pat"] = values["cfo"] / values["pat"]
    if values.get("debt") is not None and values.get("cash") is not None:
        values["net_debt"] = values["debt"] - values["cash"]
        if values.get("ebitda") not in (None, 0):
            values["net_debt_ebitda"] = values["net_debt"] / values["ebitda"]
    evidence = [{"fact_id": row["id"], "metric": metric, "value": row["value"], "unit": row["unit"],
                 "source_url": row["source_url"], "sha256": row["filing_sha256"],
                 "available_at": row["available_at"], "taxonomy_field": row["taxonomy_field"]}
                for metric, row in selected.items()]
    return values, evidence


def run_company_check(identifier: str, force: bool = False) -> dict[str, Any]:
    con = connect(); ensure_schema(con)
    row = con.execute('SELECT isin,symbol FROM universe WHERE upper(isin)=upper(?) OR upper(symbol)=upper(?) ORDER BY CASE WHEN upper(isin)=upper(?) THEN 0 ELSE 1 END LIMIT 1',
                      (identifier, identifier, identifier)).fetchone()
    if not row:
        con.close(); return {"status": "UNKNOWN_COMPANY", "identifier": identifier}
    isin, symbol = row
    filing_id, filing_period, management_date, credit_date = latest_checkpoint(con, isin)
    prior_state = con.execute('SELECT last_filing_id,last_management_communication,last_credit_rating_update FROM company_check_state WHERE isin=?', (isin,)).fetchone()
    if not force and prior_state and tuple(prior_state) == (filing_id, management_date, credit_date):
        cached = con.execute('SELECT result_json FROM company_check_result WHERE isin=?', (isin,)).fetchone()
        con.close()
        return {**json.loads(cached[0]), "run_status": "SKIPPED_NO_NEW_INFORMATION"} if cached else {"status": "SKIPPED_NO_NEW_INFORMATION", "symbol": symbol}
    periods = annual_periods(con, isin)
    pair = None
    for current in periods:
        previous = next((p for p in periods if p[2] == current[2] and 350 <= (date.fromisoformat(current[1])-date.fromisoformat(p[1])).days <= 380), None)
        if previous:
            pair = current, previous; break
    current, previous, evidence = {}, {}, []
    period_end = previous_end = None
    if pair:
        current, current_evidence = period_values(con, isin, pair[0])
        previous, previous_evidence = period_values(con, isin, pair[1])
        evidence = current_evidence + previous_evidence
        period_end, previous_end = pair[0][1], pair[1][1]
    derived = {
        "revenue_yoy": growth(current.get("revenue"), previous.get("revenue")),
        "pat_yoy": growth(current.get("pat"), previous.get("pat")),
        "debt_growth": growth(current.get("debt"), previous.get("debt")),
        "receivable_growth": growth(current.get("receivables"), previous.get("receivables")),
        "inventory_growth": growth(current.get("inventory"), previous.get("inventory")),
        "ebitda_margin": current.get("ebitda_margin"), "cfo_pat": current.get("cfo_pat"),
        "net_debt_ebitda": current.get("net_debt_ebitda"),
    }
    events = [{"event_type": r[0], "date": r[1], "severity": r[2], "explanation": r[3],
               "source_url": r[4], "sha256": r[5], "verified": bool(r[6])}
              for r in con.execute('SELECT event_type,event_date,severity,explanation,source_url,source_sha256,verified FROM company_material_event WHERE isin=? ORDER BY event_date DESC', (isin,))]
    due = due_commitments(con, isin)
    missed = [c for c in due if c["status"] == "MISSED"]
    metric_bundle = {"current": current, "prior": previous, "evidence": evidence}
    flags = evaluate(metric_bundle, period_end, events=events, missed_commitments=missed)
    commitments = [dict(zip(("id","claim_date","source_url","source_sha256","source_evidence","metric","target","unit","deadline","status","actual_value","actual_fact_ids","evaluated_at"), r))
                   for r in con.execute('SELECT id,claim_date,source_url,source_sha256,source_evidence,metric,target,unit,deadline,status,actual_value,actual_fact_ids,evaluated_at FROM management_commitment WHERE isin=? ORDER BY claim_date DESC', (isin,))]
    required = ("revenue", "ebitda", "pat", "cfo", "debt", "cash", "receivables", "inventory", "promoter_holding", "promoter_pledge")
    missing = [m for m in required if current.get(m) is None]
    result = {"status": "VERIFIED_PARTIAL" if current else "DATA_INSUFFICIENT", "run_status": "PROCESSED",
              "isin": isin, "symbol": symbol, "period_end": period_end, "previous_period_end": previous_end,
              "financials": {k: current.get(k) for k in required}, "derived": derived,
              "red_flags": flags, "management_commitments": commitments, "events": events,
              "missing_information": missing, "evidence": evidence,
              "data_freshness": max((e["available_at"] for e in evidence), default=None),
              "advanced_metrics": "OPTIONAL_NOT_BLOCKING", "synthetic_values": 0,
              "ghost_sources": 0, "thresholds": thresholds_dict()}
    checked_at = datetime.now(timezone.utc).isoformat()
    result["revised_at"] = checked_at
    con.execute('''INSERT INTO company_check_result VALUES(?,?,?,?,?,?,?) ON CONFLICT(isin) DO UPDATE SET
      symbol=excluded.symbol,status=excluded.status,period_end=excluded.period_end,previous_period_end=excluded.previous_period_end,
      updated_at=excluded.updated_at,result_json=excluded.result_json''',
      (isin,symbol,result["status"],period_end,previous_end,checked_at,json.dumps(result)))
    con.execute('''INSERT INTO company_check_state
      (isin,symbol,last_filing_id,last_result_period,last_management_communication,last_credit_rating_update,checked_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(isin) DO UPDATE SET symbol=excluded.symbol,last_filing_id=excluded.last_filing_id,
      last_result_period=excluded.last_result_period,last_management_communication=excluded.last_management_communication,
      last_credit_rating_update=excluded.last_credit_rating_update,checked_at=excluded.checked_at''',
      (isin,symbol,filing_id,filing_period,management_date,credit_date,checked_at))
    con.commit(); con.close(); return result
