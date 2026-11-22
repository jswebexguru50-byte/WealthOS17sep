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
