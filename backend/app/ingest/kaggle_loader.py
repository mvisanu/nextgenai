"""
Kaggle dataset loader and column mapper.
Downloads three Kaggle datasets and maps them to canonical schemas.
Falls back to demo/seed_sql/*.csv if KAGGLE credentials are absent.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

import pandas as pd

from backend.app.observability.logging import get_logger

logger = get_logger(__name__)

# Seed CSV paths (relative to repo root — resolved at runtime)
_REPO_ROOT = Path(__file__).resolve().parents[3]
SEED_DIR = _REPO_ROOT / "demo" / "seed_sql"


def _has_kaggle_credentials() -> bool:
    return bool(os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"))


def _try_kaggle_download(slug: str, dest_path: Path) -> Path | None:
    """
    Attempt to download a Kaggle dataset. Returns the local path to the
    downloaded files directory, or None on failure.
    """
    try:
        import kagglehub  # type: ignore

        dataset_path = kagglehub.dataset_download(slug)
        logger.info("Kaggle dataset downloaded", extra={"slug": slug, "path": dataset_path})
        return Path(dataset_path)
    except Exception as exc:
        logger.warning(
            "Kaggle download failed — will use seed fallback",
            extra={"slug": slug, "error": str(exc)},
        )
        return None


def _first_csv(directory: Path) -> Path | None:
    """Return the first CSV found in a directory tree."""
    for p in sorted(directory.rglob("*.csv")):
        return p
    return None


def _gen_id(prefix: str) -> str:
    return f"{prefix}-{str(uuid.uuid4())[:8].upper()}"


# ---------------------------------------------------------------------------
# Dataset 1: Manufacturing defects (fahmidachowdhury)
# ---------------------------------------------------------------------------


def load_manufacturing_defects(config: Any = None) -> pd.DataFrame:
    """
    Load fahmidachowdhury/manufacturing-defects and map to canonical schema.
    Falls back to demo/seed_sql/manufacturing_defects.csv if no Kaggle credentials.

    Canonical columns:
        defect_id, product, defect_type, severity, inspection_date,
        plant, lot_number, action_taken, source
    """
    slug = "fahmidachowdhury/manufacturing-defects"
    seed_csv = SEED_DIR / "manufacturing_defects.csv"

    df_raw: pd.DataFrame | None = None

    if _has_kaggle_credentials():
        dl_path = _try_kaggle_download(slug, seed_csv)
        if dl_path and dl_path.is_dir():
            csv_path = _first_csv(dl_path)
            if csv_path:
                df_raw = pd.read_csv(csv_path)

    if df_raw is None:
        logger.warning("Using seed fallback for manufacturing_defects")
        df_raw = pd.read_csv(seed_csv)

    # Column mapping — Kaggle dataset uses these column names:
    column_map = {
        # Common name variations observed in the dataset
        "Product": "product",
        "product": "product",
        "DefectType": "defect_type",
        "Defect_Type": "defect_type",
        "defect_type": "defect_type",
        "Severity": "severity",
        "severity": "severity",
        "InspectionDate": "inspection_date",
        "Inspection_Date": "inspection_date",
        "inspection_date": "inspection_date",
        "Plant": "plant",
        "plant": "plant",
        "LotNumber": "lot_number",
        "Lot_Number": "lot_number",
        "lot_number": "lot_number",
        "ActionTaken": "action_taken",
        "Action_Taken": "action_taken",
        "action_taken": "action_taken",
    }
    df_raw = df_raw.rename(columns={k: v for k, v in column_map.items() if k in df_raw.columns})

    # Ensure all canonical columns exist
    required = ["product", "defect_type", "severity", "inspection_date", "plant", "lot_number", "action_taken"]
    for col in required:
        if col not in df_raw.columns:
            df_raw[col] = None

    df_raw["defect_id"] = [_gen_id("DEF") for _ in range(len(df_raw))]
    df_raw["source"] = "kaggle/fahmidachowdhury"

    result = df_raw[["defect_id", "product", "defect_type", "severity", "inspection_date",
                      "plant", "lot_number", "action_taken", "source"]].copy()
    logger.info("Manufacturing defects loaded", extra={"rows": len(result)})
    return result


# ---------------------------------------------------------------------------
# Dataset 2: Supplemental defects (rabieelkharoua)
# ---------------------------------------------------------------------------


def load_defects_supplemental(config: Any = None) -> pd.DataFrame:
    """
    Load rabieelkharoua/predicting-manufacturing-defects-dataset and map to canonical schema.

    This dataset predicts defect occurrence — we treat each row as an inspection event.
    Falls back to demo/seed_sql/defects_supplemental.csv.
    """
    slug = "rabieelkharoua/predicting-manufacturing-defects-dataset"
    seed_csv = SEED_DIR / "defects_supplemental.csv"

    df_raw: pd.DataFrame | None = None

    if _has_kaggle_credentials():
        dl_path = _try_kaggle_download(slug, seed_csv)
        if dl_path and dl_path.is_dir():
            csv_path = _first_csv(dl_path)
            if csv_path:
                df_raw = pd.read_csv(csv_path)

    if df_raw is None:
        logger.warning("Using seed fallback for defects_supplemental")
        df_raw = pd.read_csv(seed_csv)

    # Column mapping — this dataset commonly uses different names
    column_map = {
        "ProductionVolume": "product",
        "ProductType": "product",
        "product_type": "product",
        "DefectRate": "defect_type",
        "DefectType": "defect_type",
        "defect_category": "defect_type",
        "QualityScore": "severity",
        "Severity": "severity",
        "Date": "inspection_date",
        "ProductionDate": "inspection_date",
        "ManufacturingPlant": "plant",
        "Plant": "plant",
        "BatchID": "lot_number",
        "LotID": "lot_number",
        "CorrectiveAction": "action_taken",
        "RecommendedAction": "action_taken",
    }
    df_raw = df_raw.rename(columns={k: v for k, v in column_map.items() if k in df_raw.columns})

    required = ["product", "defect_type", "severity", "inspection_date", "plant", "lot_number", "action_taken"]
    for col in required:
        if col not in df_raw.columns:
            df_raw[col] = None

    df_raw["defect_id"] = [_gen_id("DEF") for _ in range(len(df_raw))]
    df_raw["source"] = "kaggle/rabieelkharoua"

    result = df_raw[["defect_id", "product", "defect_type", "severity", "inspection_date",
                      "plant", "lot_number", "action_taken", "source"]].copy()
    logger.info("Supplemental defects loaded", extra={"rows": len(result)})
    return result


# ---------------------------------------------------------------------------
# Dataset 3: Aircraft maintenance (merishnasuwal)
# ---------------------------------------------------------------------------


def load_maintenance_logs(config: Any = None) -> pd.DataFrame:
    """
    Load merishnasuwal/aircraft-historical-maintenance-dataset and map to canonical schema.
    Falls back to demo/seed_sql/maintenance_logs.csv.

    Canonical columns:
        log_id, asset_id, ts, metric_name, metric_value, unit, source
    """
    slug = "merishnasuwal/aircraft-historical-maintenance-dataset"
    seed_csv = SEED_DIR / "maintenance_logs.csv"

    df_raw: pd.DataFrame | None = None

    if _has_kaggle_credentials():
        dl_path = _try_kaggle_download(slug, seed_csv)
        if dl_path and dl_path.is_dir():
            csv_path = _first_csv(dl_path)
            if csv_path:
                df_raw = pd.read_csv(csv_path)

    if df_raw is None:
        logger.warning("Using seed fallback for maintenance_logs")
        df_raw = pd.read_csv(seed_csv)

    # Column mapping — aircraft maintenance dataset
    column_map = {
        "Aircraft_ID": "asset_id",
        "AircraftID": "asset_id",
        "aircraft_id": "asset_id",
        "Timestamp": "ts",
        "timestamp": "ts",
        "Date": "ts",
        "MetricName": "metric_name",
        "Metric_Name": "metric_name",
        "metric_name": "metric_name",
        "Parameter": "metric_name",
        "MetricValue": "metric_value",
        "Metric_Value": "metric_value",
        "metric_value": "metric_value",
        "Value": "metric_value",
        "Unit": "unit",
        "unit": "unit",
        # Aircraft dataset uses event type as the metric name
        "MaintenanceType": "metric_name",
        "EventType": "metric_name",
        "event_type": "metric_name",
    }
    df_raw = df_raw.rename(columns={k: v for k, v in column_map.items() if k in df_raw.columns})

    # If no asset_id column found, try to derive from tail number or registration
    if "asset_id" not in df_raw.columns:
        for candidate in ["TailNumber", "Registration", "AircraftReg", "tail_number"]:
            if candidate in df_raw.columns:
                df_raw["asset_id"] = df_raw[candidate]
                break
        else:
            df_raw["asset_id"] = [f"AIRCRAFT-{i+1:04d}" for i in range(len(df_raw))]

    # Ensure metric_name and metric_value exist
    if "metric_name" not in df_raw.columns:
        # Use first non-id column as metric name description
        candidates = [c for c in df_raw.columns if c not in ("asset_id", "ts", "log_id")]
        df_raw["metric_name"] = candidates[0] if candidates else "maintenance_event"

    if "metric_value" not in df_raw.columns:
        df_raw["metric_value"] = None

    if "unit" not in df_raw.columns:
        df_raw["unit"] = None

    if "ts" not in df_raw.columns:
        df_raw["ts"] = pd.Timestamp("2020-01-01")

    df_raw["log_id"] = [_gen_id("LOG") for _ in range(len(df_raw))]
    df_raw["source"] = "kaggle/merishnasuwal"

    result = df_raw[["log_id", "asset_id", "ts", "metric_name", "metric_value", "unit", "source"]].copy()
    logger.info("Maintenance logs loaded", extra={"rows": len(result)})
    return result
