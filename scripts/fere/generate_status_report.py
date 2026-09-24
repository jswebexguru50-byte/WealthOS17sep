"""Generate a deterministic status report from saved FERE evidence and batch checkpoints."""
from __future__ import annotations

import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from verified_filing_pipeline import ARCHIVE, DB_PATH

STORE = DB_PATH.parent
PROGRESS = STORE / 'overnight_progress.json'
JSON_REPORT = STORE / 'overnight_status_report.json'
MD_REPORT = STORE / 'overnight_status_report.md'


def grouped(con: sqlite3.Connection, table: str, column: str) -> dict:
    exists = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return dict(con.execute(f'SELECT {column},COUNT(*) FROM {table} GROUP BY {column}').fetchall()) if exists else {}


def scalar(con: sqlite3.Connection, sql: str) -> int:
    try: return int(con.execute(sql).fetchone()[0])
    except Exception: return 0


def main() -> int:
    progress = json.loads(PROGRESS.read_text(encoding='utf-8')) if PROGRESS.exists() else {}
    batches = progress.get('batches', {}); batch_states = Counter(v.get('status', 'UNKNOWN') for v in batches.values())
    con = sqlite3.connect(DB_PATH)
    integrity = scalar(con, "SELECT COUNT(*) FROM company_check_result WHERE json_extract(result_json,'$.synthetic_values')<>0 OR json_extract(result_json,'$.ghost_sources')<>0")
    report = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'run': {k: progress.get(k) for k in ('status','created_at','updated_at','batch_size','holdings_count','nifty500_count','full_nse_candidates','unique_total','deep_evidence')},
        'batches': dict(batch_states),
        'saved': {
            'filing_discovery': grouped(con, 'filing_discovery', 'status'),
            'source_documents': grouped(con, 'filing_document', 'status'),
            'official_sources': grouped(con, 'official_source_snapshot', 'source_type'),
            'verified_xbrl_facts': scalar(con, 'SELECT COUNT(*) FROM verified_xbrl_fact'),
            'symbols_with_facts': scalar(con, 'SELECT COUNT(DISTINCT isin) FROM verified_xbrl_fact'),
            'shareholding_snapshots': scalar(con, 'SELECT COUNT(*) FROM shareholding_snapshot'),
            'material_events': scalar(con, 'SELECT COUNT(*) FROM company_material_event'),
            'claim_candidates': scalar(con, 'SELECT COUNT(*) FROM management_claim_candidate'),
            'accepted_commitments': scalar(con, 'SELECT COUNT(*) FROM management_commitment'),
            'company_cards': grouped(con, 'company_check_result', 'status'),
            'integrity_violations': integrity,
        },
    }
    con.close()
    files = [p for p in ARCHIVE.rglob('*') if p.is_file()] if ARCHIVE.exists() else []
    report['archive'] = {'files': len(files), 'bytes': sum(p.stat().st_size for p in files),
                         'extensions': dict(Counter((p.suffix.lower() or '[none]') for p in files))}
    JSON_REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    lines = ['# FERE Overnight Status', '', f"Generated: {report['generated_at']}", '',
             f"Run status: **{report['run'].get('status') or 'NOT_STARTED'}**", '',
             '## Batch progress', '']
    lines += [f"- {key}: {value}" for key, value in sorted(report['batches'].items())]
    lines += ['', '## Saved and verified', '']
    for key, value in report['saved'].items(): lines.append(f'- {key.replace("_", " ")}: {value}')
    lines += ['', '## Source archive', '', f"- Files: {report['archive']['files']}",
              f"- Bytes: {report['archive']['bytes']}", f"- Extensions: {report['archive']['extensions']}", '',
              'Integrity policy: official-source lineage only; missing data remains missing; zero synthetic and ghost sources required.']
    MD_REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2)); return 1 if integrity else 0


if __name__ == '__main__':
    raise SystemExit(main())
