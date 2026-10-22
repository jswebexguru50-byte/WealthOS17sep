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
      CREATE TABLE IF NOT EXISTS company_check_history (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        revised_at TEXT NOT NULL, result_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS company_material_event (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        event_type TEXT NOT NULL, event_date TEXT NOT NULL, severity TEXT NOT NULL,
        explanation TEXT NOT NULL, source_url TEXT NOT NULL, source_sha256 TEXT NOT NULL,
        verified INTEGER NOT NULL CHECK(verified IN (0,1)),
        UNIQUE(isin,event_type,event_date,source_sha256));
      CREATE TABLE IF NOT EXISTS shareholding_snapshot (
        id INTEGER PRIMARY KEY, isin TEXT NOT NULL, symbol TEXT NOT NULL,
        period_end TEXT NOT NULL, promoter_holding REAL, promoter_pledge REAL,
        public_holding REAL, employee_trusts REAL, source_url TEXT NOT NULL,
        source_sha256 TEXT NOT NULL, available_at TEXT NOT NULL, status TEXT NOT NULL,
        UNIQUE(isin,period_end,source_sha256));
    ''')


def latest_checkpoint(con: sqlite3.Connection, isin: str) -> tuple[int, str | None, str | None, str | None, str | None]:
    row = con.execute('SELECT COALESCE(MAX(id),0),MAX(period_end) FROM filing_document WHERE isin=? AND sha256 IS NOT NULL', (isin,)).fetchone()
    management = con.execute('SELECT MAX(claim_date) FROM management_commitment WHERE isin=?', (isin,)).fetchone()[0]
    event_date = con.execute('SELECT MAX(event_date) FROM company_material_event WHERE isin=?', (isin,)).fetchone()[0]
    shareholding = con.execute('SELECT MAX(period_end) FROM shareholding_snapshot WHERE isin=?', (isin,)).fetchone()[0]
    return int(row[0]), row[1], shareholding, management, event_date


def shareholding_values(con: sqlite3.Connection, isin: str) -> tuple[dict, dict, list[dict]]:
    con.row_factory = sqlite3.Row
    rows = con.execute('''SELECT id,period_end,promoter_holding,promoter_pledge,public_holding,
      source_url,source_sha256,available_at FROM shareholding_snapshot WHERE isin=?
      ORDER BY period_end DESC,id DESC LIMIT 2''', (isin,)).fetchall()
    def values(row):
        return {"promoter_holding": row["promoter_holding"] / 100 if row["promoter_holding"] is not None else None,
                "promoter_pledge": row["promoter_pledge"] / 100 if row["promoter_pledge"] is not None else None}
    evidence = [{"fact_id": f"shareholding:{row['id']}", "metric": "promoter_holding",
                 "value": row["promoter_holding"], "unit": "PERCENT", "source_url": row["source_url"],
                 "sha256": row["source_sha256"], "available_at": row["available_at"],
                 "taxonomy_field": "NSE_REGULATION_31_SHAREHOLDING"} for row in rows]
    return (values(rows[0]) if rows else {}, values(rows[1]) if len(rows) > 1 else {}, evidence)


def changed_fields(previous: dict | None, current: dict) -> list[dict]:
    if not previous: return []
    changes = []
    for section in ("financials", "derived"):
        before, after = previous.get(section, {}), current.get(section, {})
        for key in sorted(set(before) | set(after)):
            if before.get(key) != after.get(key):
                changes.append({"field": f"{section}.{key}", "before": before.get(key), "after": after.get(key)})
    before_flags = {f.get("rule") for f in previous.get("red_flags", [])}
    after_flags = {f.get("rule") for f in current.get("red_flags", [])}
    for rule in sorted(after_flags - before_flags): changes.append({"field": "red_flag", "before": None, "after": rule})
    for rule in sorted(before_flags - after_flags): changes.append({"field": "red_flag", "before": rule, "after": None})
    return changes


def evaluate_commitments(con: sqlite3.Connection, isin: str, current: dict, derived: dict,
                         evidence: list[dict]) -> None:
    today = date.today().isoformat()
    fact_ids = json.dumps([item["fact_id"] for item in evidence])
    rows = con.execute("SELECT id,metric,target,unit,deadline,status FROM management_commitment WHERE isin=? AND status IN ('OPEN','ON_TRACK','PARTIAL')", (isin,)).fetchall()
    for claim_id, metric, target, unit, deadline, status in rows:
        key = str(metric).lower().replace(' ', '_')
        actual = {"revenue": current.get("revenue"), "margin": current.get("ebitda_margin"),
                  "ebitda_margin": current.get("ebitda_margin"), "debt": current.get("debt"),
                  "debt_reduction": current.get("debt"), "growth": derived.get("revenue_yoy")}.get(key)
        normalized = actual
        unit_text = str(unit or '').lower()
        if actual is not None and unit_text in ('crore', 'cr', '₹ crore', 'rs crore'):
            normalized = actual / 10_000_000
        elif actual is not None and unit_text in ('%', 'percent', 'percentage'):
            normalized = actual * 100
        if target is None or normalized is None:
            new_status = 'NOT_VERIFIABLE' if deadline and deadline <= today else 'OPEN'
        else:
            achieved = normalized <= target if key in ('debt', 'debt_reduction') else normalized >= target
            new_status = 'ACHIEVED' if achieved else 'MISSED' if deadline and deadline <= today else 'ON_TRACK'
        con.execute('''UPDATE management_commitment SET status=?,actual_value=?,actual_fact_ids=?,evaluated_at=? WHERE id=?''',
                    (new_status,normalized,fact_ids,datetime.now(timezone.utc).isoformat(),claim_id))


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
    filing_id, filing_period, shareholding_date, management_date, event_date = latest_checkpoint(con, isin)
    prior_state = con.execute('SELECT last_filing_id,last_shareholding_filing,last_management_communication,last_credit_rating_update FROM company_check_state WHERE isin=?', (isin,)).fetchone()
    if not force and prior_state and tuple(prior_state) == (filing_id, shareholding_date, management_date, event_date):
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
    share_current, share_previous, share_evidence = shareholding_values(con, isin)
    current.update({k: v for k, v in share_current.items() if v is not None})
    previous.update({k: v for k, v in share_previous.items() if v is not None})
    evidence.extend(share_evidence)
    trends = []
    for period in periods[:3]:
        values, refs = period_values(con, isin, period)
        trends.append({"period_end": period[1], "revenue": values.get("revenue"), "ebitda": values.get("ebitda"),
                       "pat": values.get("pat"), "cfo": values.get("cfo"), "ebitda_margin": values.get("ebitda_margin"),
                       "source_fact_ids": [r["fact_id"] for r in refs]})
    derived = {
        "revenue_yoy": growth(current.get("revenue"), previous.get("revenue")),
        "pat_yoy": growth(current.get("pat"), previous.get("pat")),
        "debt_growth": growth(current.get("debt"), previous.get("debt")),
        "receivable_growth": growth(current.get("receivables"), previous.get("receivables")),
        "inventory_growth": growth(current.get("inventory"), previous.get("inventory")),
        "ebitda_margin": current.get("ebitda_margin"), "cfo_pat": current.get("cfo_pat"),
        "net_debt_ebitda": current.get("net_debt_ebitda"),
    }
    evaluate_commitments(con, isin, current, derived, evidence)
    event_columns = {row[1] for row in con.execute('PRAGMA table_info(company_material_event)')}
    document_select = 'document_url' if 'document_url' in event_columns else 'NULL'
    events = [{"event_type": r[0], "date": r[1], "severity": r[2], "explanation": r[3],
               "source_url": r[4], "sha256": r[5], "verified": bool(r[6]), "document_url": r[7]}
              for r in con.execute(f'SELECT event_type,event_date,severity,explanation,source_url,source_sha256,verified,{document_select} FROM company_material_event WHERE isin=? ORDER BY event_date DESC', (isin,))]
    due = due_commitments(con, isin)
    missed = [c for c in due if c["status"] == "MISSED"]
    metric_bundle = {"current": current, "prior": previous, "evidence": evidence}
    flags = evaluate(metric_bundle, period_end, events=events, missed_commitments=missed)
    commitments = [dict(zip(("id","claim_date","source_url","source_sha256","source_evidence","metric","target","unit","deadline","status","actual_value","actual_fact_ids","evaluated_at"), r))
                   for r in con.execute('SELECT id,claim_date,source_url,source_sha256,source_evidence,metric,target,unit,deadline,status,actual_value,actual_fact_ids,evaluated_at FROM management_commitment WHERE isin=? ORDER BY claim_date DESC', (isin,))]
    required = ("revenue", "ebitda", "pat", "cfo", "debt", "cash", "receivables", "inventory", "promoter_holding", "promoter_pledge")
    missing = [m for m in required if current.get(m) is None]
    source_coverage = [
        {"source": "NSE financial-result XBRL", "authority": "OFFICIAL", "status": "AVAILABLE" if any(isinstance(e.get("fact_id"), int) for e in evidence) else "NOT_AVAILABLE"},
        {"source": "NSE Regulation 31 shareholding", "authority": "OFFICIAL", "status": "AVAILABLE" if current.get("promoter_holding") is not None else "NOT_AVAILABLE"},
        {"source": "NSE corporate announcements", "authority": "OFFICIAL", "status": "AVAILABLE" if events else "NO_CLASSIFIED_EVENT"},
        {"source": "BSE corporate filings", "authority": "OFFICIAL", "status": "PLANNED_FALLBACK"},
        {"source": "SEBI orders and corporate-filings directory", "authority": "OFFICIAL", "status": "PLANNED_FALLBACK"},
        {"source": "MCA company filings", "authority": "OFFICIAL", "status": "PLANNED_FALLBACK"},
        {"source": "Issuer investor-relations and rating-agency releases", "authority": "PRIMARY", "status": "PLANNED_FALLBACK"},
        {"source": "Screener financials, ratios, peers and document links", "authority": "SECONDARY_DISCOVERY_ONLY", "status": "NOT_INGESTED"},
    ]
    prior_card_row = con.execute('SELECT result_json FROM company_check_result WHERE isin=?', (isin,)).fetchone()
    prior_card = json.loads(prior_card_row[0]) if prior_card_row else None
    result = {"status": "VERIFIED_PARTIAL" if current else "DATA_INSUFFICIENT", "run_status": "PROCESSED",
              "isin": isin, "symbol": symbol, "period_end": period_end, "previous_period_end": previous_end,
              "financials": {k: current.get(k) for k in required}, "derived": derived,
              "red_flags": flags, "management_commitments": commitments, "events": events,
              "three_year_trends": trends,
              "source_coverage": source_coverage,
              "missing_information": missing, "evidence": evidence,
              "data_freshness": max((e["available_at"] for e in evidence), default=None),
              "advanced_metrics": "OPTIONAL_NOT_BLOCKING", "synthetic_values": 0,
              "ghost_sources": 0, "thresholds": thresholds_dict()}
    checked_at = datetime.now(timezone.utc).isoformat()
    result["revised_at"] = checked_at
    result["changes_since_previous_card"] = changed_fields(prior_card, result)
    if prior_card:
        con.execute('INSERT INTO company_check_history(isin,symbol,revised_at,result_json) VALUES(?,?,?,?)',
                    (isin,symbol,prior_card.get("revised_at", checked_at),json.dumps(prior_card)))
    con.execute('''INSERT INTO company_check_result VALUES(?,?,?,?,?,?,?) ON CONFLICT(isin) DO UPDATE SET
      symbol=excluded.symbol,status=excluded.status,period_end=excluded.period_end,previous_period_end=excluded.previous_period_end,
      updated_at=excluded.updated_at,result_json=excluded.result_json''',
      (isin,symbol,result["status"],period_end,previous_end,checked_at,json.dumps(result)))
    con.execute('''INSERT INTO company_check_state
      (isin,symbol,last_filing_id,last_result_period,last_shareholding_filing,last_management_communication,last_credit_rating_update,checked_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(isin) DO UPDATE SET symbol=excluded.symbol,last_filing_id=excluded.last_filing_id,
      last_result_period=excluded.last_result_period,last_shareholding_filing=excluded.last_shareholding_filing,
      last_management_communication=excluded.last_management_communication,
      last_credit_rating_update=excluded.last_credit_rating_update,checked_at=excluded.checked_at''',
      (isin,symbol,filing_id,filing_period,shareholding_date,management_date,event_date,checked_at))
    con.commit(); con.close(); return result
