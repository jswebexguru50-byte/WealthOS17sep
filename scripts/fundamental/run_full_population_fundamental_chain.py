"""Deterministic full-population fundamental enrichment chain.

This is the same source chain used for the selected 179-share dossier. It does
not call an LLM and it deliberately keeps FERE outside the acquisition chain as
an independent additional check.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "fundamental_enrichment"
PRIORITY = DATA / "priority_manifest.json"
MANIFEST = DATA / "full_population_manifest.json"
PROGRESS = DATA / "full_population_chain_progress.json"
LOG = DATA / "full_population_chain.log"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_progress(state: dict) -> None:
    state["updatedAt"] = now()
    temp = PROGRESS.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    temp.replace(PROGRESS)


def run_step(state: dict, name: str, command: list[str], env: dict[str, str]) -> None:
    state["currentStep"] = name
    state["steps"][name] = {"status": "RUNNING", "startedAt": now()}
    write_progress(state)
    with LOG.open("a", encoding="utf-8") as log:
        log.write(f"\n{now()} START {name}: {' '.join(command)}\n")
        log.flush()
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=log,
                                stderr=subprocess.STDOUT, check=False)
    state["steps"][name].update({"status": "COMPLETED" if result.returncode == 0 else "FAILED",
                                 "exitCode": result.returncode, "completedAt": now()})
    write_progress(state)
    if result.returncode:
        raise RuntimeError(f"{name} failed with exit code {result.returncode}")


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)
    priority = json.loads(PRIORITY.read_text(encoding="utf-8"))
    symbols = list(dict.fromkeys(str(s).strip().upper() for s in priority["ordered"] if str(s).strip()))
    MANIFEST.write_text(json.dumps({
        "source": str(PRIORITY.relative_to(ROOT)).replace("\\", "/"),
        "generatedAt": now(),
        "totalSymbols": len(symbols),
        "symbols": symbols,
        "fereRole": "INDEPENDENT_ADDITIONAL_CHECK_NOT_A_DATA_FILL_SOURCE",
    }, indent=2), encoding="utf-8")

    state = {"status": "RUNNING", "startedAt": now(), "requested": len(symbols),
             "manifest": str(MANIFEST.relative_to(ROOT)).replace("\\", "/"),
             "llmCalls": 0, "fereIntegrated": False, "currentStep": None, "steps": {}}
    write_progress(state)
    env = os.environ.copy()
    env["FUNDAMENTAL_MANIFEST_PATH"] = str(MANIFEST)
    env["NODE_OPTIONS"] = "--require=./scripts/node_userinfo_fallback.cjs --use-system-ca"
    python = sys.executable
    steps = [
        ("UPSTOX_EIGHT_ENDPOINTS", ["npx.cmd", "tsx", "scripts/fundamental/run_upstox_fundamental_enrichment.ts", "--group", "ordered", "--batch-size", "1", "--endpoint-delay-ms", "750", "--symbol-delay-ms", "1500"]),
        ("OFFICIAL_NSE_PLEDGE", [python, "scripts/fundamental/enrich_pledge_official.py"]),
        ("MARKED_SECONDARY_FALLBACK", [python, "scripts/fundamental/enrich_remaining_final.py"]),
        ("SUNRISE_PLI_TAGGING", [python, "scripts/fundamental/tag_sunrise_pli.py"]),
        ("PERMANENT_DATABASE_SYNC", [python, "scripts/fundamental/sync_verified_fundamentals_package.py", "--manifest", str(MANIFEST)]),
        ("MANDATORY_AND_OPTIONAL_ANALYSIS", ["npx.cmd", "tsx", "scripts/fundamental/run_filter_enrichment_daemon.ts", "--universe", "all", "--refresh", "true", "--once", "true", "--batch-size", "25"]),
        ("COVERAGE_AUDIT", [python, "scripts/fundamental/audit_full_population_coverage.py"]),
    ]
    try:
        for name, command in steps:
            run_step(state, name, command, env)
        state["status"] = "COMPLETED"
        state["currentStep"] = None
        write_progress(state)
        return 0
    except Exception as exc:
        state["status"] = "FAILED"
        state["error"] = str(exc)
        write_progress(state)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
