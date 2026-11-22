"""Parse a private MCP pilot file conservatively; unmatched data remains unknown.

Trendlyne responses have varied formats. This parser supports only labelled blocks
with SYMBOL:value rows; it never guesses mappings for BSE codes or column units.
"""
import json
import re
from datetime import datetime

SYMBOL_RE=re.compile(r'^[A-Z0-9&.\-]+$')


def parse_payload(batch):
    """Return per-batch observations plus diagnostics, without assuming metric tokens."""
    request=batch.get('request',{})
    requested={s.upper() for s in request.get('stock_codes',[]) if isinstance(s,str)}
    if batch.get('state')!='received_unvalidated':
        return {'observations':[], 'warnings':['batch not received successfully']}
    contents=batch.get('response',{}).get('content',[])
    text='\n'.join(x.get('text','') for x in contents if x.get('type')=='text')
    try:
        payload=json.loads(text)
        if payload.get('status')=='error': return {'observations':[], 'warnings':['provider returned an error']}
        text=payload.get('data','')
    except (ValueError,AttributeError):
        pass
    if not isinstance(text,str): return {'observations':[], 'warnings':['unsupported response format']}
    parsed=[]; seen=set(); warnings=[]
    for block in re.split(r'\n\s*---\s*\n',text):
        lines=[x.strip() for x in block.splitlines() if x.strip()]
        if len(lines)<2 or '|' in lines[0]: continue
        label=lines[0]
        for line in lines[1:]:
            if ':' not in line: continue
            symbol,value=map(str.strip,line.split(':',1)); symbol=symbol.upper()
            if not SYMBOL_RE.fullmatch(symbol) or symbol not in requested: continue
            key=(symbol,label)
            if key in seen:
                warnings.append('duplicate symbol/label: '+symbol+' / '+label)
                parsed=[x for x in parsed if (x['symbol'],x['label'])!=key]
                continue
            seen.add(key)
            parsed.append({'symbol':symbol,'label':label,'value_text':value,
                           'received_at':batch.get('received_at'),'source':'Trendlyne MCP',
                           'unit':None,'basis':None,'reporting_period':None,'published_at':None,
                           'verification':'unverified'})
    if not parsed: warnings.append('no unambiguous matching rows; confirm provider format')
    return {'observations':parsed,'warnings':warnings}


def parse_file(path):
    with open(path,encoding='utf8') as f: data=json.load(f)
    if data.get('source')!='Trendlyne MCP': raise ValueError('unexpected provider')
    return [parse_payload(batch) for batch in data.get('responses',[])]
