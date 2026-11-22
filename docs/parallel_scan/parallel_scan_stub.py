"""Reference scaffold, not a production connector.

Run: python3 parallel_scan_stub.py input.json output.json
Input is a JSON array of {signal, bars, observations}. See SPEC.md for contracts.
The adapter to the existing scanner and Trendlyne MCP are intentionally unimplemented:
no vendor schemas, entry rules, or thresholds have been invented.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class Signal:
    signal_id: str
    scanner_run_id: str
    symbol: str
    exchange: str
    strategy: str
    signal_date: str
    entry: float
    stop: float
    target: float
    entry_convention: str  # Must be mapped from the source strategy.


@dataclass(frozen=True)
class Bar:
    session: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    complete: bool = True
    price_basis_verified: bool = True


@dataclass(frozen=True)
class Observation:
    field: str
    value: Any
    unit: str | None
    reporting_period: str | None
    published_at: str | None
    fetched_at: str
    source: str
    basis: str | None  # consolidated, standalone, or unknown
    evidence_url: str | None


class FundamentalsProvider(Protocol):
    def fetch(self, identifiers: list[str], parameters: list[str]) -> list[Observation]:
        """Implement through supported MCP client; validate actual response and quotas."""
        ...


class TrendlyneAdapter:
    def fetch(self, identifiers: list[str], parameters: list[str]) -> list[Observation]:
        if len(identifiers) > 10 or len(parameters) > 50:
            raise ValueError("Trendlyne documented batch limits exceeded")
        raise NotImplementedError("Connect authenticated MCP client and map verified tokens")


def batches(items: list[str], size: int):
    if size <= 0:
        raise ValueError("batch size must be positive")
    for i in range(0, len(items), size):
        yield items[i:i + size]


def inspect_lifecycle(signal: Signal, bars: list[Bar]) -> dict:
    """Report observable touches after signal; never infer fills or intrabar sequence."""
    date.fromisoformat(signal.signal_date)
    if not (0 < signal.stop < signal.entry < signal.target):
        raise ValueError("stub supports long signals with stop < entry < target only")
    sessions = set()
    touches = []
    uncertain = []
    for b in sorted(bars, key=lambda x: x.session):
        date.fromisoformat(b.session)
        if b.session in sessions:
            raise ValueError(f"duplicate session {b.session}")
        sessions.add(b.session)
        if b.session <= signal.signal_date or not b.complete:
            continue
        if not (0 < b.low <= min(b.open, b.close) <= max(b.open, b.close) <= b.high):
            raise ValueError(f"invalid OHLC on {b.session}")
        if not b.price_basis_verified:
            uncertain.append(b.session)
            continue
        hit = {k: b.low <= v <= b.high for k, v in
               (("entry", signal.entry), ("stop", signal.stop), ("target", signal.target))}
        touches.append({"session": b.session, **hit,
                        "stop_and_target_same_bar": hit["stop"] and hit["target"],
                        "open_below_stop": b.open < signal.stop,
                        "open_above_target": b.open > signal.target})
    return {"observations": touches, "uncertain_sessions": uncertain,
            "limitations": ["Touches are not fills", "Intrabar sequence is unknown",
                            "Signal-day entry convention and missing sessions not evaluated"]}


def build_card(signal: Signal, bars: list[Bar], observations: list[Observation]) -> dict:
    fields = {o.field for o in observations if o.value is not None}
    required = {"revenue", "operating_cash_flow", "profit", "debt", "roe"}
    return {"signal": asdict(signal), "lifecycle": inspect_lifecycle(signal, bars),
            "fundamentals": [asdict(x) for x in observations],
            "missing_pilot_fields": sorted(required - fields),
            "review_status": "needs_data" if required - fields else "needs_review",
            "note": "Pilot fields only; reporting periods and company type need review."}


def write_atomic(destination: Path, payload: object) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=destination.parent, prefix=".parallel-scan-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, allow_nan=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, destination)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: parallel_scan_stub.py INPUT_JSON OUTPUT_JSON")
    records = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    cards, errors, ids = [], [], set()
    for record in records:
        try:
            s = Signal(**record["signal"])
            if s.signal_id in ids:
                raise ValueError("duplicate signal ID")
            ids.add(s.signal_id)
            cards.append(build_card(s, [Bar(**b) for b in record.get("bars", [])],
                                    [Observation(**o) for o in record.get("observations", [])]))
        except (KeyError, TypeError, ValueError) as exc:
            errors.append({"signal_id": record.get("signal", {}).get("signal_id"), "error": str(exc)})
    write_atomic(Path(sys.argv[2]), {"schema_version": 1, "cards": cards, "errors": errors})
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
