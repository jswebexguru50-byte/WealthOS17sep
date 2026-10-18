"""Quarantine fabricated Trendlyne rows (generated placeholder payload, see QA report).
Dry-run by default. --apply copies rows into quarantine_* tables, then deletes them from live
tables in ONE transaction (fully reversible: restore with INSERT ... SELECT from quarantine_*).
Scope: every trendlyne_raw_response row (all 927 carry the generated 62.5/14.2/18.5 payload) and
every company_facts row whose sourceDocumentId points at one, plus facts derived from those."""
import sqlite3, sys, json

DB = 'portfolio.db'
apply = '--apply' in sys.argv

def main():
    con = sqlite3.connect(DB if apply else f'file:{DB}?mode=ro', uri=not apply, timeout=60)
    raw_ids = [r[0] for r in con.execute('SELECT response_id FROM trendlyne_raw_response')]
    ph = lambda n: ','.join('?' * n)
    fact_ids, derived = set(), set()
    for i in range(0, len(raw_ids), 800):
        ch = raw_ids[i:i + 800]
        fact_ids.update(r[0] for r in con.execute(
            f'SELECT factId FROM company_facts WHERE sourceDocumentId IN ({ph(len(ch))})', ch))
    # derived facts: parentFactIds/inputFactIds are JSON lists of factIds
    for fid, parents, inputs in con.execute(
            "SELECT factId, parentFactIds, inputFactIds FROM company_facts "
            "WHERE (parentFactIds IS NOT NULL AND parentFactIds!='') OR (inputFactIds IS NOT NULL AND inputFactIds!='')"):
        if fid in fact_ids: continue
        for blob in (parents, inputs):
            try: lst = json.loads(blob) if blob else []
            except ValueError: lst = []
            if fact_ids.intersection(lst): derived.add(fid); break
    all_facts = sorted(fact_ids | derived)
    print(f'raw responses: {len(raw_ids)}  facts via sourceDocumentId: {len(fact_ids)}  derived facts: {len(derived)}')
    if not apply:
        print('dry-run; pass --apply to quarantine'); return
    con.execute('BEGIN IMMEDIATE')
    con.execute('CREATE TABLE IF NOT EXISTS quarantine_trendlyne_raw_response AS SELECT *, NULL AS quarantined_at, NULL AS reason FROM trendlyne_raw_response WHERE 0')
    con.execute('CREATE TABLE IF NOT EXISTS quarantine_company_facts AS SELECT *, NULL AS quarantined_at, NULL AS reason FROM company_facts WHERE 0')
    why = "'fabricated Trendlyne placeholder payload'"
    con.execute(f"INSERT INTO quarantine_trendlyne_raw_response SELECT *, datetime('now'), {why} FROM trendlyne_raw_response")
    for i in range(0, len(all_facts), 800):
        ch = all_facts[i:i + 800]
        con.execute(f"INSERT INTO quarantine_company_facts SELECT *, datetime('now'), {why} FROM company_facts WHERE factId IN ({ph(len(ch))})", ch)
        con.execute(f'DELETE FROM company_facts WHERE factId IN ({ph(len(ch))})', ch)
    con.execute('DELETE FROM trendlyne_raw_response')
    q1 = con.execute('SELECT count(*) FROM quarantine_trendlyne_raw_response').fetchone()[0]
    q2 = con.execute('SELECT count(*) FROM quarantine_company_facts').fetchone()[0]
    assert q1 >= len(raw_ids) and q2 >= len(all_facts), 'quarantine copy incomplete; rolling back'
    con.commit()
    print(f'quarantined: raw={q1} facts={q2}')

main()
