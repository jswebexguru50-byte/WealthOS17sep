import sqlite3

con = sqlite3.connect("portfolio.db")
cur = con.cursor()

print("Recent date row counts in HistoricalPrices:")
cur.execute("""
    SELECT date, count(distinct symbol), count(*) 
    FROM HistoricalPrices 
    WHERE date >= '2026-09-20' 
    GROUP BY date 
    ORDER BY date
""")
for row in cur.fetchall():
    print(row)

# Also check where DuckDbAdjustedOhlcvService gets its data
print("\nChecking DuckDbAdjustedOhlcvService config:")
with open("src/server/services/DuckDbAdjustedOhlcvService.ts", "r", encoding="utf-8") as f:
    for line in f:
        if "data" in line.lower() or "parquet" in line.lower() or "path" in line.lower():
            print("  ", line.strip())
