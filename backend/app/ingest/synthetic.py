"""
Synthetic incident narrative generator.
Produces 10,000 realistic manufacturing/maintenance incident reports
with sufficient diversity for meaningful vector search and graph construction.
"""
from __future__ import annotations

import csv
import random
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Domain vocabulary for generating realistic narratives
# ---------------------------------------------------------------------------

SYSTEMS = [
    "Hydraulics", "Pneumatics", "Electrical", "Mechanical", "Structural",
    "Avionics", "Propulsion", "Fuel System", "Landing Gear", "Flight Controls",
]

SUBSYSTEMS = [
    "actuator", "pump", "valve", "sensor", "controller", "bearing",
    "connector", "harness", "bracket", "manifold", "filter", "seal",
    "relay", "switch", "compressor", "regulator", "cylinder", "piston",
]

SEVERITIES = ["critical", "high", "medium", "low", "informational"]

SEVERITY_WEIGHTS = [0.05, 0.15, 0.35, 0.35, 0.10]

LOCATIONS = [
    "Line 1", "Line 2", "Line 3", "Bay A", "Bay B", "Bay C",
    "Assembly Area", "Test Bench", "Paint Shop", "Final Inspection",
    "Warehouse", "Receiving Dock", "Hangar 1", "Hangar 2",
]

DEFECT_TYPES = [
    "crack", "corrosion", "wear", "contamination", "misalignment",
    "fatigue", "delamination", "erosion", "leakage", "vibration",
    "overheating", "short circuit", "loose fastener", "improper torque",
    "surface damage", "dimensional nonconformance",
]

CORRECTIVE_ACTIONS = [
    "replaced the defective component and conducted post-maintenance functional test",
    "cleaned and treated affected area; applied corrosion inhibitor; re-inspected",
    "torqued all fasteners to specification; conducted vibration analysis; cleared",
    "performed non-destructive testing; replaced assembly; returned to service",
    "isolated and replaced failed sensor; calibrated replacement unit; verified",
    "drained and flushed system; replaced filter and seals; pressure-tested",
    "realigned assembly to specification; documented findings; submitted NCR",
    "overhauled pump assembly; bench-tested to confirm rated output; reinstalled",
    "replaced wiring harness; performed continuity and insulation resistance tests",
    "submitted component for metallurgical analysis; installed serviceable spare",
    "adjusted clearances per maintenance manual; documented in log; no further action",
    "escalated to engineering for design review; interim inspection interval reduced",
]

NARRATIVE_TEMPLATES = [
    (
        "During routine {inspection_type} inspection on {location}, technician {tech_id} "
        "observed a {defect} on the {subsystem} of the {system} system for asset {asset_id}. "
        "The {defect} was located at the {position} and measured approximately {measurement}. "
        "Adjacent components appeared {adjacent_state}. The finding was classified as {severity} "
        "severity per maintenance manual chapter {chapter}. {additional_context} "
        "Work order {wo_num} was raised and the unit was removed from service pending repair."
    ),
    (
        "Asset {asset_id} ({system} system) was brought in for unscheduled maintenance at {location} "
        "after operator reported {symptom} during {operation_phase}. Inspection revealed {defect} "
        "on the {subsystem}, serial number {sn}. The {defect} showed signs of {progression} "
        "indicating the condition had been developing over approximately {timeframe}. "
        "Engineering was notified per procedure {proc_num}. Severity assessed as {severity}."
    ),
    (
        "Scheduled {interval} maintenance on {system} system (asset {asset_id}) at {location} "
        "revealed anomalous wear pattern on {subsystem}. Visual inspection confirmed {defect} "
        "consistent with {cause}. Inspection also noted {secondary_finding} at the {position}. "
        "Component was tagged as unserviceable. {severity} classification applied. "
        "Corrective action initiated under work order {wo_num}."
    ),
    (
        "Quality control inspection of batch {lot_num} (product: {product}) identified {defect} "
        "affecting the {subsystem} interface on {count} of {sample_size} units inspected. "
        "The non-conformance originated from {nc_source} and was discovered at {location}. "
        "Severity: {severity}. All affected units quarantined. NCR-{ncr_num} raised. "
        "Root cause analysis initiated; preliminary findings suggest {preliminary_cause}."
    ),
    (
        "Post-repair inspection of {asset_id} ({system}/{subsystem}) conducted at {location} "
        "following {prior_event} revealed residual {defect}. The condition was unexpected "
        "given prior repair documentation. Severity reclassified from low to {severity} "
        "after detailed dimensional check using {measurement_tool}. Additional inspection "
        "of fleet assets {fleet_range} recommended. Finding logged as {finding_id}."
    ),
]


def _random_asset_id() -> str:
    prefix = random.choice(["ASSET", "ENG", "FRAME", "HYD", "AVION"])
    return f"{prefix}-{random.randint(100, 999)}"


def _random_sn() -> str:
    return f"SN-{random.randint(100000, 999999)}"


def _random_wo() -> str:
    return f"WO-{random.randint(10000, 99999)}"


def _random_ncr() -> str:
    return f"{random.randint(2020, 2025)}-{random.randint(1000, 9999)}"


def _generate_narrative(
    asset_id: str, system: str, subsystem: str, severity: str, defect: str
) -> str:
    template = random.choice(NARRATIVE_TEMPLATES)
    kwargs = {
        "asset_id": asset_id,
        "system": system,
        "subsystem": subsystem,
        "severity": severity,
        "defect": defect,
        "inspection_type": random.choice(["100-hour", "annual", "pre-flight", "phase", "zonal"]),
        "location": random.choice(LOCATIONS),
        "tech_id": f"TECH-{random.randint(100, 999)}",
        "position": random.choice(["aft attachment point", "forward bulkhead", "root fitting",
                                    "junction box", "lower surface", "rib station 7"]),
        "measurement": random.choice(["3.2mm", "12mm", "0.8 inch", "2.5 cm", "negligible depth"]),
        "adjacent_state": random.choice(["serviceable", "showing early wear", "nominal",
                                          "within limits", "corroded at interface"]),
        "chapter": random.randint(20, 85),
        "additional_context": random.choice([
            "Logbook review showed no prior reports on this component.",
            "Previous inspection 300 flight hours ago noted no anomaly.",
            "Similar finding reported on sister aircraft two months prior.",
            "Component at 78% of its life limit.",
            "",
        ]),
        "wo_num": _random_wo(),
        "symptom": random.choice(["unusual vibration", "abnormal pressure drop", "intermittent fault",
                                   "control surface stiffness", "fluid seepage", "warning light"]),
        "operation_phase": random.choice(["taxi-out", "climb", "cruise", "approach", "ground run"]),
        "sn": _random_sn(),
        "progression": random.choice(["accelerated progression", "stable growth", "recent initiation",
                                       "chronic cycling damage"]),
        "timeframe": random.choice(["200 flight hours", "3 months", "6 weeks", "two service cycles"]),
        "proc_num": f"AMM-{random.randint(20, 99)}-{random.randint(10, 99)}-{random.randint(100, 999)}",
        "interval": random.choice(["500-hour", "annual", "phase", "out-of-phase"]),
        "cause": random.choice(["improper lubrication", "thermal cycling", "foreign object impact",
                                 "fatigue loading", "environmental exposure", "manufacturing variance"]),
        "secondary_finding": random.choice(["minor surface oxidation", "micro-crack indication",
                                             "loose fastener", "fretting wear", "contamination"]),
        "lot_num": f"LOT-{random.randint(1000, 9999)}",
        "product": random.choice(["Bracket Assy A", "Valve Body B", "Actuator C", "Sensor Module D",
                                   "Control Unit E", "Pump Assembly F"]),
        "count": random.randint(1, 5),
        "sample_size": random.randint(10, 50),
        "nc_source": random.choice(["incoming material", "in-process machining", "heat treatment",
                                     "assembly error", "handling damage"]),
        "ncr_num": _random_ncr(),
        "preliminary_cause": random.choice(["raw material deviation", "process parameter drift",
                                             "tooling wear", "operator error", "design margin"]),
        "prior_event": random.choice(["scheduled overhaul", "bird strike repair", "hard landing",
                                       "lightning strike check", "corrosion treatment"]),
        "measurement_tool": random.choice(["digital micrometer", "eddy current", "ultrasonic thickness gauge",
                                           "dye penetrant", "borescope"]),
        "fleet_range": f"ASSET-{random.randint(100,300)} through ASSET-{random.randint(301,500)}",
        "finding_id": f"FIND-{random.randint(10000, 99999)}",
    }
    return template.format(**kwargs)


def generate_synthetic_incidents(
    n: int = 10000,
    output_path: str | Path | None = None,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate n synthetic incident report rows.

    Args:
        n:           Number of rows to generate. Default: 10,000.
        output_path: If provided, write CSV to this path (creates parent dirs).
        seed:        Random seed for reproducibility.

    Returns:
        DataFrame with columns: incident_id, asset_id, system, sub_system,
        event_date, location, severity, narrative, corrective_action, source.

    Idempotent: if output_path already exists, reads and returns the existing file
    without regenerating (avoids expensive re-generation on restart).
    """
    if output_path is not None:
        path = Path(output_path)
        if path.exists():
            logger.info(
                "Synthetic incidents file already exists — loading from disk",
                extra={"path": str(path)},
            )
            return pd.read_csv(path)

    logger.info("Generating synthetic incidents", extra={"n": n})
    random.seed(seed)

    start_date = date(2020, 1, 1)
    date_range_days = (date(2025, 12, 31) - start_date).days

    rows: list[dict[str, Any]] = []
    for i in range(n):
        system = random.choice(SYSTEMS)
        subsystem = random.choice(SUBSYSTEMS)
        severity = random.choices(SEVERITIES, weights=SEVERITY_WEIGHTS, k=1)[0]
        defect = random.choice(DEFECT_TYPES)
        asset_id = _random_asset_id()
        event_date = start_date + timedelta(days=random.randint(0, date_range_days))
        corrective_action = random.choice(CORRECTIVE_ACTIONS)
        narrative = _generate_narrative(asset_id, system, subsystem, severity, defect)

        rows.append({
            "incident_id": f"INC-{format(random.getrandbits(32), '08X')}",
            "asset_id": asset_id,
            "system": system,
            "sub_system": subsystem,
            "event_date": event_date.isoformat(),
            "location": random.choice(LOCATIONS),
            "severity": severity,
            "narrative": narrative,
            "corrective_action": corrective_action,
            "source": "synthetic",
        })

    df = pd.DataFrame(rows)

    if output_path is not None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(path, index=False)
        logger.info("Synthetic incidents written to CSV", extra={"path": str(path), "rows": len(df)})

    logger.info("Synthetic incidents generated", extra={"rows": len(df)})
    return df
