import sys
import json
import duckdb
import time
from datetime import datetime
from pathlib import Path

# Worker initialization
try:
    con = duckdb.connect(':memory:')
    con.execute("SET threads = 4")
    con.execute("SET preserve_insertion_order = false")
except Exception as e:
    sys.stderr.write(f"Worker init failed: {e}\n")
    sys.exit(1)

CATALOG_PATH = Path('data/market_data/tejhq_hf_10y/ohlcv.duckdb').resolve()
KITE_ROOT = Path('data/market_data/tejhq_hf_10y/kite_adjusted_backfill/candles').resolve()
ALIAS_ROOT = Path('data/market_data/tejhq_hf_10y/resolved_symbol_aliases').resolve()
INDEX_ROOT = Path('data/market_data/tejhq_hf_10y/kite_index_backfill/candles').resolve()

def send_response(response: dict):
    # Ensure stdout is newline delimited JSON
    sys.stdout.write(json.dumps(response) + '\n')
    sys.stdout.flush()

def handle_query(req: dict):
    req_id = req.get('id')
    symbols = req.get('symbols', [])
    limit = req.get('limit', 1000)
    from_date = req.get('fromDate', '1900-01-01')
    to_date = req.get('toDate', '2999-12-31')

    t0 = time.time()
    
    if not symbols:
        send_response({
            'id': req_id,
            'ok': True,
            'rows': [],
            'coveredSymbols': [],
            'coverageGaps': [],
            'queryMs': int((time.time() - t0) * 1000)
        })
        return

    # Kite index candles have a distinct raw schema and directory layout.
    # Handle this explicitly so benchmark values are never invented by the app.
    if len(symbols) == 1 and str(symbols[0]).strip().upper() == 'NIFTY 50':
        index_path = INDEX_ROOT / 'index=NSE__NIFTY 50' / 'part-0.parquet'
        if not index_path.exists():
            send_response({'id': req_id, 'ok': True, 'rows': [], 'coveredSymbols': [],
                           'coverageGaps': ['NIFTY 50'], 'queryMs': int((time.time() - t0) * 1000)})
            return
        try:
            rows = con.execute("""
                SELECT trade_date, 'NIFTY 50' AS symbol, NULL::VARCHAR AS isin,
                       NULL::VARCHAR AS upstox_key_nse, open AS open_adjusted,
                       high AS high_adjusted, low AS low_adjusted, close AS close_adjusted,
                       volume AS volume_raw, data_source
                FROM read_parquet(?)
                WHERE trade_date >= ? AND trade_date <= ?
                ORDER BY trade_date DESC LIMIT ?
            """, [str(index_path), from_date, to_date, limit]).df().to_dict(orient='records')
            rows.reverse()
            send_response({'id': req_id, 'ok': True, 'rows': rows,
                           'coveredSymbols': ['NIFTY 50'], 'coverageGaps': [],
                           'queryMs': int((time.time() - t0) * 1000)})
        except Exception as e:
            send_response({'id': req_id, 'ok': False, 'error': str(e)})
        return

    # Check coverage on filesystem
    covered = []
    gaps = []
    parquet_files = []
    
    for s in symbols:
        sym = str(s).strip().upper()
        if not sym:
            continue
        alias_path = ALIAS_ROOT / f"symbol={sym}" / "part-0.parquet"
        p = alias_path if alias_path.exists() else KITE_ROOT / f"symbol={sym}" / "part-0.parquet"
        if p.exists():
            covered.append(sym)
            parquet_files.append(str(p).replace('\\', '/'))
        else:
            gaps.append(sym)
            
    if not covered:
        send_response({
            'id': req_id,
            'ok': True,
            'rows': [],
            'coveredSymbols': [],
            'coverageGaps': gaps,
            'queryMs': int((time.time() - t0) * 1000)
        })
        return

    # Execute query
    try:
        query = f"""
            SELECT 
                trade_date::VARCHAR as trade_date,
                symbol,
                isin,
                upstox_key_nse,
                open_adjusted,
                high_adjusted,
                low_adjusted,
                close_adjusted,
                volume_raw,
                data_source
            FROM read_parquet({parquet_files}, union_by_name=true)
            WHERE trade_date >= '{from_date}' AND trade_date <= '{to_date}'
            QUALIFY ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) <= {limit}
            -- Keep the newest N bars per symbol, then return them in
            -- chronological order. All technical strategies treat the final
            -- array element as the current candle/CMP.
            ORDER BY symbol, trade_date ASC
        """
        
        # We must return an array of rows or dict of arrays
        df = con.execute(query).df()
        
        # Convert to list of dicts with native Python types
        rows = df.to_dict(orient='records')
        
        send_response({
            'id': req_id,
            'ok': True,
            'rows': rows,
            'coveredSymbols': covered,
            'coverageGaps': gaps,
            'queryMs': int((time.time() - t0) * 1000)
        })
        
    except Exception as e:
        sys.stderr.write(f"Query error: {e}\n")
        send_response({
            'id': req_id,
            'ok': False,
            'error': str(e),
            'queryMs': int((time.time() - t0) * 1000)
        })

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            sys.stderr.write(f"Invalid JSON: {line}\n")
            continue
            
        cmd = req.get('cmd')
        
        if cmd == 'ping':
            send_response({
                'id': req.get('id'),
                'ok': True,
                'pong': True
            })
        elif cmd == 'shutdown':
            send_response({
                'id': req.get('id'),
                'ok': True
            })
            break
        elif cmd == 'query':
            handle_query(req)
        else:
            sys.stderr.write(f"Unknown command: {cmd}\n")
            send_response({
                'id': req.get('id'),
                'ok': False,
                'error': f"Unknown command: {cmd}"
            })

if __name__ == '__main__':
    main()
