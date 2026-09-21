# A1 Database Integrity Audit

**Database Ready**: false

## Checks
- **duplicate symbol/date**: PASS (Expected: 0, Actual: undefined)
- **NULL symbol**: PASS (Expected: 0, Actual: undefined)
- **NULL date**: PASS (Expected: 0, Actual: undefined)
- **NULL OHLC**: PASS (Expected: 0, Actual: undefined)
- **non-positive prices**: PASS (Expected: 0, Actual: undefined)
- **high < low**: PASS (Expected: 0, Actual: undefined)
- **open > high**: FAIL (Expected: 0, Actual: 92)
- **open < low**: FAIL (Expected: 0, Actual: 98)
- **close > high**: PASS (Expected: 0, Actual: undefined)
- **close < low**: PASS (Expected: 0, Actual: undefined)
- **orphan rows**: REVIEW (Expected: 0, Actual: 289823)
- **MasterTickers duplicate symbols**: FAIL (Expected: 0, Actual: 37)