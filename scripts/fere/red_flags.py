"""Small deterministic FERE red-flag engine. Never infers fraud or missing facts."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Thresholds:
    material_growth: float = 0.15
    divergence_pp: float = 0.25
    margin_drop_pp: float = 0.02
    promoter_drop_pp: float = 0.02
    pledge_increase_pp: float = 0.01
    leverage_growth_gap_pp: float = 0.20


def growth(current: float | None, prior: float | None) -> float | None:
    if current is None or prior in (None, 0):
        return None
    return current / prior - 1


def flag(rule: str, severity: str, explanation: str, evidence: list[dict[str, Any]],
         date: str) -> dict[str, Any]:
    return {"rule": rule, "severity": severity, "explanation": explanation,
            "evidence": evidence, "date": date, "fraud_inference": False}


def evaluate(metrics: dict[str, Any], date: str | None = None,
             thresholds: Thresholds = Thresholds(), events: list[dict[str, Any]] | None = None,
             missed_commitments: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    date = date or datetime.now(timezone.utc).date().isoformat()
    current, prior = metrics.get("current", {}), metrics.get("prior", {})
    result: list[dict[str, Any]] = []
    rev_g, pat_g = growth(current.get("revenue"), prior.get("revenue")), growth(current.get("pat"), prior.get("pat"))
    cfo_g = growth(current.get("cfo"), prior.get("cfo"))
    rec_g = growth(current.get("receivables"), prior.get("receivables"))
    inv_g = growth(current.get("inventory"), prior.get("inventory"))
    debt_g, ebitda_g = growth(current.get("debt"), prior.get("debt")), growth(current.get("ebitda"), prior.get("ebitda"))
    margin_c = current.get("ebitda_margin")
    margin_p = prior.get("ebitda_margin")
    refs = metrics.get("evidence", [])
    if pat_g is not None and cfo_g is not None and pat_g >= thresholds.material_growth and cfo_g < 0:
        result.append(flag("EARNINGS_CASH_DIVERGENCE", "MATERIAL",
                           f"PAT grew {pat_g:.1%} while CFO changed {cfo_g:.1%}.", refs, date))
    if rec_g is not None and rev_g is not None and rec_g - rev_g >= thresholds.divergence_pp:
        result.append(flag("RECEIVABLE_STRESS", "MATERIAL",
                           f"Receivables grew {rec_g:.1%} versus revenue {rev_g:.1%} ({rec_g-rev_g:.1%} gap).", refs, date))
    if inv_g is not None and rev_g is not None and inv_g - rev_g >= thresholds.divergence_pp:
        result.append(flag("INVENTORY_BUILDUP", "WATCH",
                           f"Inventory grew {inv_g:.1%} versus revenue {rev_g:.1%} ({inv_g-rev_g:.1%} gap).", refs, date))
    if debt_g is not None and ebitda_g is not None and debt_g - ebitda_g >= thresholds.leverage_growth_gap_pp:
        result.append(flag("LEVERAGE_DETERIORATION", "MATERIAL",
                           f"Debt grew {debt_g:.1%} versus EBITDA {ebitda_g:.1%}.", refs, date))
    if margin_c is not None and margin_p is not None and margin_p - margin_c >= thresholds.margin_drop_pp:
        result.append(flag("MARGIN_DETERIORATION", "WATCH",
                           f"EBITDA margin fell from {margin_p:.1%} to {margin_c:.1%}.", refs, date))
    ph_c, ph_p = current.get("promoter_holding"), prior.get("promoter_holding")
    if ph_c is not None and ph_p is not None and ph_p - ph_c >= thresholds.promoter_drop_pp:
        result.append(flag("PROMOTER_HOLDING_DROP", "MATERIAL", f"Promoter holding fell by {ph_p-ph_c:.1%}.", refs, date))
    pp_c, pp_p = current.get("promoter_pledge"), prior.get("promoter_pledge")
    if pp_c is not None and pp_p is not None and pp_c - pp_p >= thresholds.pledge_increase_pp:
        result.append(flag("PROMOTER_PLEDGE_INCREASE", "MATERIAL", f"Promoter pledge rose by {pp_c-pp_p:.1%}.", refs, date))
    event_rules = {
        "AUDITOR_RESIGNATION", "CFO_RESIGNATION", "CREDIT_RATING_DOWNGRADE",
        "DEFAULT_OR_PAYMENT_DELAY", "MATERIAL_DILUTION", "REGULATORY_ACTION",
        "GUIDANCE_CUT", "PROJECT_DELAY",
    }
    for event in events or []:
        if event.get("event_type") in event_rules and event.get("verified") is True:
            result.append(flag(event["event_type"], event.get("severity", "MATERIAL"),
                               event.get("explanation", event["event_type"]), [event], event.get("date", date)))
    for claim in missed_commitments or []:
        result.append(flag("MANAGEMENT_COMMITMENT_MISSED", "MATERIAL",
                           f"Accepted commitment missed: {claim.get('metric')} target {claim.get('target')} {claim.get('unit') or ''}.",
                           [claim], claim.get("evaluated_at", date)))
    return result


def thresholds_dict(thresholds: Thresholds = Thresholds()) -> dict[str, Any]:
    return asdict(thresholds)
