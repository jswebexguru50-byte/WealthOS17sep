"""Apply the audited 29Q data-conflict migration to a SQLite database.

The live database must be at exactly v16.  The migration is one transaction,
records v17 in the application's ``db_migrations`` ledger, and may create a
SQLite-consistent backup before it writes anything.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


SQL = (
    """CREATE TABLE IF NOT EXISTS data_conflicts (
        id INTEGER PRIMARY KEY,
        symbol TEXT NOT NULL,
        field TEXT NOT NULL,
        source_a TEXT NOT NULL,
        source_b TEXT NOT NULL,
        diff_pct REAL NOT NULL,
        detected_at TEXT NOT NULL
    )""",
    """CREATE INDEX IF NOT EXISTS idx_data_conflicts_symbol_field
       ON data_conflicts(symbol, field, detected_at DESC)""",
)


def apply(db_path: Path, backup_path: Path | None = None) -> None:
    if not db_path.is_file():
        raise RuntimeError(f"database not found: {db_path}")

    connection = sqlite3.connect(db_path)
    try:
        connection.execute("PRAGMA busy_timeout=30000")
        version = connection.execute(
            "SELECT COALESCE(MAX(version), 0) FROM db_migrations"
        ).fetchone()[0]
        if version == 17:
            print("Already at v17; no changes made.")
            return
        if version != 16:
            raise RuntimeError(f"expected db_migrations version 16, found {version}")

        if backup_path is not None:
            if backup_path.exists():
                raise RuntimeError(f"backup path already exists: {backup_path}")
            destination = sqlite3.connect(backup_path)
            try:
                connection.backup(destination)
            finally:
                destination.close()

        with connection:
            for statement in SQL:
                connection.execute(statement)
            connection.execute(
                "INSERT INTO db_migrations (version, name) VALUES (?, ?)",
                (17, "data_conflicts"),
            )

        table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'data_conflicts'"
        ).fetchone()
        final_version = connection.execute(
            "SELECT MAX(version) FROM db_migrations"
        ).fetchone()[0]
        if not table_exists or final_version != 17:
            raise RuntimeError("post-migration validation failed")
        print("Applied v17 data_conflicts successfully.")
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=Path("portfolio.db"))
    parser.add_argument("--backup", type=Path)
    args = parser.parse_args()
    try:
        apply(args.db, args.backup)
    except (RuntimeError, sqlite3.Error) as error:
        print(f"Migration failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
