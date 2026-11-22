"""Reference contracts for the parallel scan; integration is deliberately unimplemented.

Uses only Python's standard library. This file does not connect to brokers, MCP,
SQLite, or TradingView and does not implement strategy or ranking logic.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable, Optional, Protocol, Sequence


class EvidenceState(str, Enum):
    AVAILABLE = 'available'
    MISSING = 'missing'
    STALE = 'stale'
    NOT_APPLICABLE = 'not_applicable'
    FETCH_FAILED = 'fetch_failed'
    NOT_CHECKED = 'not_checked'
    SEARCHED_ABSENT = 'searched_absent'


@dataclass(frozen=True)
class Evidence:
    field: str
    state: EvidenceState
    value: Any
    source: str
    fetched_at: str
    period: Optional[str] = None
    published_at: Optional[str] = None
    basis: Optional[str] = None
    unit: Optional[str] = None
    source_location: Optional[str] = None

    def validate(self) -> None:
        parse_time(self.fetched_at)
        if self.published_at:
            parse_time(self.published_at)
        if self.state == EvidenceState.AVAILABLE and self.value is None:
            raise ValueError('available evidence requires a value')
        if self.state not in (EvidenceState.AVAILABLE, EvidenceState.STALE) and self.value is not None:
            raise ValueError('non-available evidence must not contain a value')
        if self.state == EvidenceState.SEARCHED_ABSENT and not self.source_location:
            raise ValueError('confirmed absence requires documented search scope')


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('timestamps must include a timezone')
    return parsed.astimezone(timezone.utc)


def was_known_at(evidence: Evidence, decision_at: str) -> Optional[bool]:
    """None means unknowable; retrieval time alone never proves publication time."""
    evidence.validate()
    if not evidence.published_at:
        return None
    return parse_time(evidence.published_at) <= parse_time(decision_at)


@dataclass(frozen=True)
class RunManifest:
    run_id: str
    scanner_run_id: str
    universe_version: str
    scan_start: str
    scan_end: str
    price_snapshot_id: Optional[str]
    strategy_sha256: str
    config_sha256: str
    input_sha256: dict[str, str]
    created_at: str

    def validate(self) -> None:
        if not all((self.run_id, self.scanner_run_id, self.universe_version, self.input_sha256)):
            raise ValueError('missing run identity or inputs')
        parse_time(self.created_at)
        for digest in [self.strategy_sha256, self.config_sha256, *self.input_sha256.values()]:
            if len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
                raise ValueError('invalid SHA-256')
        # Snapshot absence must be displayed, not silently labeled reproducible.


def hash_file(path: Path) -> str:
    h = sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def partition_requests(stock_codes: Sequence[str], parameters: Sequence[str]) -> Iterable[tuple[list[str], list[str]]]:
    """Trendlyne documented maxima; caller must verify provider schema and quota."""
    stocks = list(dict.fromkeys(stock_codes))
    fields = list(dict.fromkeys(parameters))
    if not stocks or not fields:
        raise ValueError('stocks and parameters required')
    for i in range(0, len(stocks), 10):
        for j in range(0, len(fields), 50):
            yield stocks[i:i + 10], fields[j:j + 50]


class ScannerAdapter(Protocol):
    def read_signals(self, manifest: RunManifest) -> list[dict[str, Any]]:
        """Validate exact schema and source hashes; retain original rows."""
        ...


class MarketDataReader(Protocol):
    def complete_bars(self, security_id: str, start: str, end: str) -> list[dict[str, Any]]:
        """Read same verified price snapshot, or report snapshot unavailable."""
        ...


class TrendlyneMCP(Protocol):
    def parameters(self, stocks: list[str], tokens: list[str]) -> list[Evidence]:
        """Implement via authenticated vendor client; verify identity/basis/units."""
        ...


def run_parallel_scan(manifest: RunManifest, scanner: ScannerAdapter,
                      market: MarketDataReader, fundamentals: TrendlyneMCP) -> None:
    manifest.validate()
    raise NotImplementedError('Wire actual scanner schema, snapshot, MCP and output contracts after pilot')
