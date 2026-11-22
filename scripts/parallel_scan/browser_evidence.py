"""Validate explicitly captured Trendlyne browser observations (not a scraper).

Only observations with a named source, security, basis, period and capture time
are accepted. These remain user-reviewable website observations, not audited facts.
"""
import json
from datetime import datetime
from urllib.parse import urlparse


def load_browser_evidence(path):
    with open(path, encoding='utf-8') as f:
        data=json.load(f)
    if data.get('schema_version') != 1 or not isinstance(data.get('observations'),list):
        raise ValueError('expected browser evidence schema version 1')
    results={}; seen=set()
    for observation in data['observations']:
        if not isinstance(observation,dict): raise ValueError('observation must be an object')
        required=('symbol','field','value','unit','basis','period','observed_at','source_url')
        if any(observation.get(k) is None or observation.get(k)=='' for k in required):
            raise ValueError('browser observation missing required context')
        symbol=observation['symbol']
        if not isinstance(symbol,str) or not symbol.strip(): raise ValueError('invalid symbol')
        url=urlparse(observation['source_url'])
        if url.scheme!='https' or url.hostname not in ('trendlyne.com','www.trendlyne.com') or url.username or url.password or url.query or url.fragment:
            raise ValueError('source URL must be a public Trendlyne page without credentials or query')
        stamp=datetime.fromisoformat(observation['observed_at'].replace('Z','+00:00'))
        if stamp.tzinfo is None: raise ValueError('observed_at requires timezone')
        key=(symbol.upper(),observation['field'],observation['period'],observation['basis'])
        if key in seen: raise ValueError('duplicate browser evidence key')
        seen.add(key)
        item=dict(observation);item['verification']='unverified_browser_observation'
        item['published_at']=observation.get('published_at')
        results.setdefault(symbol.upper(),[]).append(item)
    return results
