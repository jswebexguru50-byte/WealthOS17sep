"""Deterministic coverage audit for mandatory and optional fundamentals."""
from __future__ import annotations
import json, sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data' / 'fundamental_enrichment'
MANIFEST = DATA / 'full_population_manifest.json'
OUTPUT = DATA / 'full_population_coverage_audit.json'

def count_present(conn, column, symbols):
    marks = ','.join('?' for _ in symbols)
    return conn.execute(f"SELECT COUNT(DISTINCT symbol) FROM strategy_fundamental_filter_results WHERE run_key='filters:holdings:' || ? AND symbol IN ({marks}) AND {column} IS NOT NULL", [len(symbols), *symbols]).fetchone()[0]

def main():
    symbols = json.loads(MANIFEST.read_text(encoding='utf-8'))['symbols']
    marks = ','.join('?' for _ in symbols)
    db = sqlite3.connect(ROOT / 'portfolio.db')
    endpoints = {}
    for endpoint, count in db.execute(f"SELECT endpoint,COUNT(DISTINCT symbol) FROM fundamental_endpoint_snapshots WHERE provider='UPSTOX_FUNDAMENTALS' AND status='SUCCESS' AND symbol IN ({marks}) GROUP BY endpoint", symbols):
        endpoints[endpoint] = count
    mandatory = {
        'promoter_holding': count_present(db, 'promoter_pct', symbols),
        'eight_quarter_profitability': count_present(db, 'profitable_last_8_quarters', symbols),
        'roce': count_present(db, 'roce_pct', symbols),
        'roe': count_present(db, 'roe_pct', symbols),
        'promoter_pledge': count_present(db, 'pledged_pct', symbols),
        'fii_dii_involvement': count_present(db, 'institutional_involvement_pass', symbols),
        'cfo_to_operating_profit': count_present(db, 'cash_flow_to_operating_profit', symbols),
    }
    optional = {
        'company_profile': endpoints.get('profile', 0),
        'competitors': endpoints.get('competitors', 0),
        'corporate_actions': endpoints.get('corporate-actions', 0),
        'sunrise_or_pli': db.execute(f"SELECT COUNT(DISTINCT symbol) FROM sunrise_industrial_universe WHERE is_active=1 AND symbol IN ({marks})", symbols).fetchone()[0],
        'institutional_purchase_records': db.execute(f"SELECT COUNT(*) FROM InstitutionalDeals WHERE symbol IN ({marks})", symbols).fetchone()[0],
        'qglp_available': db.execute(f"SELECT COUNT(DISTINCT symbol) FROM strategy_fundamental_filter_results WHERE run_key='filters:holdings:' || ? AND qglp_status NOT IN ('NOT_AVAILABLE','') AND qglp_status IS NOT NULL", [len(symbols)]).fetchone()[0],
        'sector_momentum_available': db.execute(f"SELECT COUNT(DISTINCT symbol) FROM strategy_fundamental_filter_results WHERE run_key='filters:holdings:' || ? AND sector_momentum_status NOT IN ('NOT_AVAILABLE','') AND sector_momentum_status IS NOT NULL", [len(symbols)]).fetchone()[0],
        'double_momentum_available': db.execute(f"SELECT COUNT(DISTINCT symbol) FROM strategy_fundamental_filter_results WHERE run_key='filters:holdings:' || ? AND double_momentum_status NOT IN ('NOT_AVAILABLE','') AND double_momentum_status IS NOT NULL", [len(symbols)]).fetchone()[0],
    }
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'population': len(symbols),
              'llmCalls': 0, 'fereRole': 'INDEPENDENT_ADDITIONAL_CHECK', 'upstoxEndpointCoverage': endpoints,
              'mandatoryEvidenceCoverage': mandatory, 'nonMandatoryEvidenceCoverage': optional,
              'rule': 'Missing evidence remains NOT_AVAILABLE and never becomes a pass.'}
    OUTPUT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    db.close()

if __name__ == '__main__': main()
