-- Apply only after confirming db_migrations is at version 16.
CREATE TABLE IF NOT EXISTS data_conflicts (
    id INTEGER PRIMARY KEY,
    symbol TEXT NOT NULL,
    field TEXT NOT NULL,
    source_a TEXT NOT NULL,
    source_b TEXT NOT NULL,
    diff_pct REAL NOT NULL,
    detected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_conflicts_symbol_field
    ON data_conflicts(symbol, field, detected_at DESC);
