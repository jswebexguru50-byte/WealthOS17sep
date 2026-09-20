
### P5-F DEFECT: Asynchronous Index Creation on Missing Tables
- **Description:** Removing the MasterTickerService timeout revealed that database.ts executes CREATE INDEX IF NOT EXISTS on multiple tables (e.g., DailyOHLCV, FundamentalData) without verifying if the tables exist first. In isolated test environments where these tables are not explicitly created, this throws SQL logic error: no such table.
