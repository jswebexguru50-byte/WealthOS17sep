import json, sys, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'fundamental'))
import trendlyne_bridge as tb

calls = []


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        calls.append(b)
        data = {s: {f: {'value': 1, 'as_of': '2026-10-18', 'source': 'trendlyne_mcp'} for f in b['fields']}
                for s in b['symbols'] if s != 'BAD'}
        out = json.dumps({'success': True, 'data': data, 'errors': {}}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


class T(unittest.TestCase):
    def test_chunk_order_and_fail(self):
        srv = HTTPServer(('127.0.0.1', 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        url = 'http://127.0.0.1:%d' % srv.server_port
        syms = ['S%03d' % i for i in range(120, 0, -1)] + ['BAD']
        calls.clear()
        r = tb.fetch_batch(syms, ['pettm'], base_url=url)
        srv.shutdown()
        self.assertEqual(len(calls), 3)
        self.assertEqual(list(r), sorted(r))
        self.assertEqual(r['BAD'], {'pettm': None})
        self.assertEqual(r['S001']['pettm']['source'], 'trendlyne_mcp')

    def test_unavailable(self):
        with self.assertRaises(tb.BridgeUnavailable):
            tb.fetch_batch(['A'], ['x'], base_url='http://127.0.0.1:1', timeout=2)


if __name__ == '__main__':
    unittest.main()
