"""
29Q Research Framework — Trendlyne MCP Fetch Template
======================================================
Reusable script for fetching all data needed to run a full 29Q dossier.

Usage:
  python docs/29Q_FETCH_TEMPLATE.py --stocks MBAPL SPORTKING NRL SUNTV RUBYMILLS
  python docs/29Q_FETCH_TEMPLATE.py --stocks RELIANCE TCS INFY  (any stock list)

Outputs:
  scratchpad/29q_raw_<date>.json   — all raw MCP responses
  scratchpad/29q_parsed_<date>.json — parsed, structured data per stock

Config:
  MCP credentials read from .agents/mcp_config.json at runtime (never hardcoded)
  Pack tokens read from docs/29Q_CONFIG.json

See docs/RESEARCH_FRAMEWORK_29Q.md for the full 29Q framework reference.
"""
import json, os, sys, time, re, argparse
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import requests
except ImportError:
    os.system('pip install requests -q')
    import requests

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG    = os.path.join(ROOT, '.agents', 'mcp_config.json')
Q_CFG  = os.path.join(ROOT, 'docs', '29Q_CONFIG.json')
SP     = os.path.join(ROOT, 'scratchpad')
os.makedirs(SP, exist_ok=True)

DATE   = datetime.now().strftime('%Y%m%d_%H%M')

# ── Load configs ───────────────────────────────────────────────────────────────
with open(CFG, encoding='utf-8') as f:
    mcp_raw = json.load(f)
tl  = mcp_raw['mcpServers']['trendlyne']
MCP = tl.get('serverUrl') or tl.get('url')

with open(Q_CFG, encoding='utf-8') as f:
    qcfg = json.load(f)

PACK_A = qcfg['recommended_packs']['pack_A']['tokens']
PACK_B = qcfg['recommended_packs']['pack_B']['tokens']

# Remove duplicates preserving order
def dedup(lst):
    seen = set()
    return [x for x in lst if not (x in seen or seen.add(x))]

PACK_A = dedup(PACK_A)
PACK_B = dedup(PACK_B)
# Combined unique pack for single batch call (≤50 tokens)
PACK_FULL = dedup(PACK_A + PACK_B)[:50]


# ── MCP Client ─────────────────────────────────────────────────────────────────
class TlMcp:
    def __init__(self, url):
        self.url = url
        self.s = requests.Session()
        self.s.headers.update({'User-Agent': 'WealthOS-29Q/1.0'})
        self._id = 0

    def _nid(self):
        self._id += 1
        return self._id

    def _post(self, method, params=None, timeout=90):
        body = {'jsonrpc': '2.0', 'method': method, 'params': params or {}, 'id': self._nid()}
        r = self.s.post(self.url, json=body,
                        headers={'Content-Type': 'application/json',
                                 'Accept': 'application/json, text/event-stream'},
                        timeout=timeout)
        ct = r.headers.get('Content-Type', '')
        if 'event-stream' in ct:
            for line in r.text.splitlines():
                if line.startswith('data:'):
                    try:
                        return json.loads(line[5:].strip())
                    except Exception:
                        pass
            return {'raw_sse': r.text[:500]}
        try:
            return r.json()
        except Exception:
            return {'raw': r.text[:500]}

    def init(self):
        return self._post('initialize', {
            'protocolVersion': '2024-11-05', 'capabilities': {},
            'clientInfo': {'name': 'WealthOS-29Q', 'version': '1.0'}
        }, timeout=20)

    def call(self, name, args, timeout=90):
        return self._post('tools/call', {'name': name, 'arguments': args}, timeout=timeout)


# ── Parsers ────────────────────────────────────────────────────────────────────
def content_text(resp):
    """Extract text content from MCP tools/call response."""
    if not isinstance(resp, dict):
        return str(resp)
    result = resp.get('result', resp)
    if isinstance(result, dict):
        for item in result.get('content', []):
            if isinstance(item, dict) and item.get('type') == 'text':
                return item.get('text', '')
        sc = result.get('structuredContent', {})
        if isinstance(sc, dict) and 'result' in sc:
            return sc['result']
    return str(result)[:800]


def parse_gspv(text, symbols):
    """
    Parse GSPV pipe-delimited text into {symbol: {metric_name: value}}.
    Format: JSON wrapper {status, data} where data has sections separated by \\n\\n---\\n\\n.
    Each section: first line = metric name, subsequent lines = SYMBOL:value.
    """
    try:
        j = json.loads(text) if text.strip().startswith('{') else {}
        raw = j.get('data', text)
    except Exception:
        raw = text

    sections = raw.split('\n\n---\n\n')
    out = {s: {} for s in symbols}
    errors = []

    for sect in sections:
        lines = [l.strip() for l in sect.strip().splitlines() if l.strip()]
        if not lines:
            continue
        metric = lines[0]
        if 'Could not resolve' in metric or 'error' in metric.lower():
            errors.append(metric[:200])
            continue
        for line in lines[1:]:
            if ':' in line:
                sym, val = line.split(':', 1)
                sym = sym.strip()
                if sym in symbols:
                    v = val.strip()
                    try:
                        out[sym][metric] = float(v) if v != 'None' else None
                    except Exception:
                        out[sym][metric] = None if v == 'None' else v

    return out, errors


def compute_f_filters(data, sym):
    """
    Compute F1-F7 pass/fail for a stock given its parsed GSPV data dict.
    Returns: {F1: True/False, ...} and {F1: value, ...}
    """
    d = data.get(sym, {})

    def find(keys, d):
        for k in d:
            for kw in keys:
                if kw.lower() in k.lower():
                    return d[k]
        return None

    # F1: promoter >= 66.67%
    prom = find(['promoter holding', 'prompct'], d)
    f1 = (prom is not None and prom >= 66.67)

    # F3: ROCE >= 35%
    roce = find(['roce', 'return on capital'], d)
    f3 = (roce is not None and roce >= 35)

    # F4: ROE >= 25%
    roe = find(['roe', 'return on equity'], d)
    f4 = (roe is not None and roe >= 25)

    # F5: pledge <= 0.01%
    pledge = find(['pledge', 'prompledge'], d)
    f5 = (pledge is None or pledge <= 0.01)

    # F6: institutional >= 5% and QoQ > 0.10pp
    inst = find(['institution', 'instihold', 'fii hold'], d)
    inst_qoq = find(['instipct1q', 'institution.*1q', 'fii.*1q'], d)
    f6 = (inst is not None and inst >= 5.0) and (inst_qoq is not None and inst_qoq >= 0.10)

    # F7: CFO / EBITDA >= 0.5
    cfo = find(['cash from oper', 'cfoa'], d)
    rev = find(['total rev', 'sra'], d)
    ebitda_margin = find(['ebitda.*margin', 'pbditmargin'], d)
    if rev and ebitda_margin:
        ebitda = rev * (ebitda_margin / 100)
        f7_ratio = (cfo / ebitda) if cfo is not None and ebitda != 0 else None
        f7 = (f7_ratio is not None and f7_ratio >= 0.5)
    else:
        f7_ratio, f7 = None, False

    return {
        'F1': {'pass': f1, 'value': prom, 'threshold': 66.67},
        'F3': {'pass': f3, 'value': roce, 'threshold': 35.0},
        'F4': {'pass': f4, 'value': roe, 'threshold': 25.0},
        'F5': {'pass': f5, 'value': pledge, 'threshold': 0.01},
        'F6': {'pass': f6, 'inst': inst, 'inst_qoq': inst_qoq, 'threshold_abs': 5.0, 'threshold_qoq': 0.10},
        'F7': {'pass': f7, 'cfo': cfo, 'ebitda': ebitda if 'ebitda' in dir() else None, 'ratio': f7_ratio, 'threshold': 0.5},
    }


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='29Q Trendlyne MCP Fetch')
    parser.add_argument('--stocks', nargs='+', required=True, help='Stock symbols (2-10)')
    parser.add_argument('--filler', nargs='*', default=['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'],
                        help='Filler stocks to pad to 10-slot batch')
    args = parser.parse_args()

    tier1 = args.stocks
    filler = [s for s in args.filler if s not in tier1]
    batch = tier1 + filler
    batch = batch[:10]  # Max 10 slots

    print(f'[29Q] Stocks: {tier1}')
    print(f'[29Q] Batch (10-slot): {batch}')
    print(f'[29Q] Pack FULL ({len(PACK_FULL)} tokens): {PACK_FULL[:8]}...')

    client = TlMcp(MCP)
    print('[MCP] Initializing...')
    r0 = client.init()
    proto = r0.get('result', {}).get('protocolVersion', '?')
    print(f'[MCP] Connected: {proto}')

    results = {'meta': {'stocks': tier1, 'batch': batch, 'date': DATE, 'protocol': proto}}

    # ── CALL 1: Combined GSPV pack ──────────────────────────────────────────
    print(f'\n[CALL 1] GSPV — {len(batch)} × {len(PACK_FULL)} = {len(batch)*len(PACK_FULL)} cells')
    r1 = client.call('get_stock_parameter_values', {'stock_codes': batch, 'parameters': PACK_FULL})
    gspv_text = content_text(r1)
    gspv_data, gspv_errors = parse_gspv(gspv_text, tier1)
    results['gspv'] = {'text': gspv_text, 'parsed': gspv_data, 'errors': gspv_errors}
    print(f'  Errors: {gspv_errors if gspv_errors else "None"}')
    for sym in tier1:
        print(f'  {sym}: {len(gspv_data.get(sym,{}))} metrics returned')

    # ── CALLS 2-N: Per-stock detail calls ───────────────────────────────────
    per_stock = {}
    for sym in tier1:
        per_stock[sym] = {}
        for call_type in ['shareholding', 'overview', 'technical', 'news', 'events']:
            if call_type == 'shareholding':
                print(f'[{sym}] shareholding...')
                r = client.call('get_ownership_deals_insider_sast',
                                {'stock_code': sym, 'type': 'shareholding'}, timeout=30)
            else:
                print(f'[{sym}] {call_type}...')
                r = client.call('get_overview_news_corp_events',
                                {'stock_code': sym, 'type': call_type}, timeout=30)
            per_stock[sym][call_type] = content_text(r)
            time.sleep(0.4)

    results['per_stock'] = per_stock

    # ── Compute F-filters ───────────────────────────────────────────────────
    f_results = {}
    for sym in tier1:
        f_results[sym] = compute_f_filters(gspv_data, sym)
    results['f_filters'] = f_results

    # ── Save raw ────────────────────────────────────────────────────────────
    raw_path = os.path.join(SP, f'29q_raw_{DATE}.json')
    with open(raw_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print(f'\n[SAVED] Raw → {raw_path}')

    # ── Print F-filter summary ──────────────────────────────────────────────
    print('\n' + '='*70)
    print(f'{"Stock":<12} F1   F2   F3   F4   F5   F6   F7   Score')
    print('-'*70)
    for sym in tier1:
        ff = f_results.get(sym, {})
        row = [ff.get(f, {}).get('pass', '?') for f in ['F1','F3','F4','F5','F6','F7']]
        icons = ['✓' if v is True else ('?' if v == '?' else '✗') for v in row]
        score = sum(1 for v in row if v is True)
        print(f'{sym:<12} {icons[0]}    ?    {icons[1]}    {icons[2]}    {icons[3]}    {icons[4]}    {icons[5]}    {score}/7')
    print()
    print('Note: F2 (8Q PAT) must be computed from WealthOS SQLite DB separately.')

    return raw_path


if __name__ == '__main__':
    main()
