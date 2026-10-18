"""Python bridge to the Express /api/trendlyne-mcp/batch-fetch route (urllib only)."""
import json
import urllib.error
import urllib.request

CHUNK = 50


class BridgeUnavailable(Exception):
    """Server unreachable or returned an unusable response; callers fall through."""


def fetch_batch(symbols, fields, base_url='http://localhost:3000', timeout=60):
    syms = sorted({str(s).strip().upper() for s in symbols if str(s).strip()})
    flds = list(dict.fromkeys(fields))
    out = {}
    for i in range(0, len(syms), CHUNK):
        chunk = syms[i:i + CHUNK]
        req = urllib.request.Request(
            base_url.rstrip('/') + '/api/trendlyne-mcp/batch-fetch',
            data=json.dumps({'symbols': chunk, 'fields': flds}).encode(),
            headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = json.loads(r.read().decode())
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise BridgeUnavailable(str(e)) from e
        if not body.get('success'):
            raise BridgeUnavailable(body.get('message', 'route failure'))
        data = body.get('data') or {}
        for s in chunk:  # failed symbols: all-None so shape is stable
            out[s] = data.get(s) or {f: None for f in flds}
    return out
