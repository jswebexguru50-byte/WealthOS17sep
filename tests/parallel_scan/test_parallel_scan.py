import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('parallel_scan',Path(__file__).resolve().parents[2]/'scripts/parallel_scan/parallel_scan.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class TestLifecycle(unittest.TestCase):
    def test_ambiguous_same_day_touches_and_missing_session(self):
        event={'signal_date':'2026-01-01','levels':{'entry':100,'stop':95,'target':110}}
        bars=[{'date':'2026-01-02','open':100,'high':112,'low':94,'close':105,'status':'OK'}]
        result=mod.observations(event,bars,['2026-01-01','2026-01-02','2026-01-05'])
        self.assertTrue(result[0]['entry_range_touch'])
        self.assertTrue(result[0]['stop_range_touch'])
        self.assertTrue(result[0]['target_range_touch'])
        self.assertEqual(result[0]['intrabar_order'],'unknown')
        self.assertEqual(result[1]['state'],'missing_bar')

    def test_gap_below_stop_is_not_a_stop_touch(self):
        event={'signal_date':'2026-01-01','levels':{'entry':100,'stop':95,'target':110}}
        bar={'date':'2026-01-02','open':90,'high':94,'low':88,'close':91,'status':'OK'}
        result=mod.observations(event,[bar],['2026-01-02'])[0]
        self.assertTrue(result['open_below_stop'])
        self.assertFalse(result['stop_range_touch'])

    def test_missing_signal_level_fails_closed(self):
        with self.assertRaises(ValueError):
            mod.normalize('S2a',{'Symbol':'A','Signal_Date':'2026-01-01','Entry':100})

if __name__=='__main__': unittest.main()

spec2=importlib.util.spec_from_file_location('trendlyne_parse',Path(__file__).resolve().parents[2]/'scripts/parallel_scan/trendlyne_parse.py')
parser=importlib.util.module_from_spec(spec2); spec2.loader.exec_module(parser)

class TestTrendlyneResponse(unittest.TestCase):
    def test_only_requested_identifier_is_parsed(self):
        batch={'state':'received_unvalidated','request':{'stock_codes':['AAA']},'response':{'content':[{'type':'text','text':'ROE\nAAA:12.5\nBBB:99'}]}}
        result=parser.parse_payload(batch)
        self.assertEqual([(x['symbol'],x['value_text']) for x in result['observations']],[('AAA','12.5')])
        self.assertIsNone(result['observations'][0]['basis'])

    def test_duplicate_rows_are_not_used(self):
        batch={'state':'received_unvalidated','request':{'stock_codes':['AAA']},'response':{'content':[{'type':'text','text':'ROE\nAAA:12\nAAA:15'}]}}
        self.assertEqual(parser.parse_payload(batch)['observations'],[])

class TestReportIntegration(unittest.TestCase):
    def test_archive_to_readonly_report_and_unverified_live_data(self):
        import sqlite3, tempfile, json, zipfile
        from datetime import date, timedelta
        from pathlib import Path
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); db=root/'data.sqlite'; archive=root/'input.zip'; response=root/'live.json'
            conn=sqlite3.connect(db)
            conn.execute('create table DailyOHLCV_KiteAdj(symbol text,trade_date text,open real,high real,low real,close real,volume real,status text)')
            conn.execute('create table ScreenerFundamentals(symbol text,as_of text,roce_pct real)')
            conn.execute('create table ScreenerFieldProvenance(symbol text,field text,basis text,source_run text)')
            conn.execute('create table trendlyne_latest(symbol text,roe_ann_pct real,latest_snapshot_at text)')
            dates=[(date(2026,1,1)+timedelta(days=i)).isoformat() for i in range(22)]
            conn.executemany('insert into DailyOHLCV_KiteAdj values(?,?,?,?,?,?,?,?)',
                [(f'S{i}',d,100,102,98,101,100,'OK') for d in dates for i in range(1000)])
            conn.execute('insert into ScreenerFundamentals values(?,?,?)',('S1','2026-01-22',12))
            conn.execute('insert into ScreenerFieldProvenance values(?,?,?,?)',('S1','roce_pct','consolidated','run1'))
            conn.execute('insert into trendlyne_latest values(?,?,?)',('S1',13,'2026-01-22'))
            conn.commit(); conn.close()
            with zipfile.ZipFile(archive,'w') as z:
                for strategy in mod.STRATEGIES:
                    rows=[{'Symbol':'S1','Signal_Date':dates[0],'Entry':100,'Stop_Loss':95,'Target_1':110}] if strategy=='S2a' else []
                    z.writestr(f'{strategy}_full_universe_90_x.json',json.dumps({'strategy_id':strategy,'scan_date':'2026-01-22','match_count':len(rows),'matches':rows}))
                z.writestr('reports/readiness/tier1_22d_dedup/waterfall_rules.json',json.dumps({'window':{'start':dates[0],'end':dates[-1],'sessions':22}}))
            response.write_text(json.dumps({'source':'Trendlyne MCP','responses':[{'state':'received_unvalidated','request':{'stock_codes':['S1']},'response':{'content':[{'type':'text','text':'ROE\nS1:13'}]}}]}))
            import sys
            sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/parallel_scan'))
            report=mod.build_report(archive,db,None,response)
            self.assertEqual(report['counts']['signals'],1)
            event=report['events'][0]
            self.assertEqual(event['age_sessions'],21)
            self.assertEqual(event['fundamentals']['fields']['roce_pct']['basis'],'consolidated')
            self.assertEqual(event['trendlyne_pilot']['state'],'received_unverified')
            self.assertEqual(event['trendlyne_pilot']['observations'][0]['value_text'],'13')
            self.assertEqual(report['manifest']['snapshot_reproducibility'],'unverified')
