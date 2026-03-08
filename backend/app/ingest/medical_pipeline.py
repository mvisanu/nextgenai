"""
Medical domain ingest pipeline.

Two data sources (both with synthetic fallbacks):
  1. MACCROBAT clinical case reports (HuggingFace) → medical_cases + medical_embeddings
  2. Disease Symptoms & Patient Profile CSV (Kaggle) → disease_records

Usage:
    from backend.app.ingest.medical_pipeline import run_medical_ingest_pipeline
    summary = run_medical_ingest_pipeline()
"""
from __future__ import annotations

import json
import random
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text

from backend.app.db.session import get_sync_session
from backend.app.graph.builder import build_graph
from backend.app.observability.logging import get_logger
from backend.app.rag.chunker import chunk_text
from backend.app.rag.embeddings import EmbeddingModel

logger = get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

TREATMENT_KEYWORDS = [
    "treated", "prescribed", "administered", "performed", "underwent",
    "resected", "ablated", "repaired", "replaced", "discharged",
    "started on", "initiated", "given", "received", "managed with",
    "surgery", "therapy", "medication", "operation",
]

BODY_SYSTEM_KEYWORDS: dict[str, list[str]] = {
    "Cardiac": ["cardiac", "heart", "coronary", "atrial", "ventricular",
                "palpitation", "arrhythmia", "murmur", "tricuspid", "aortic",
                "myocardial", "angina", "infarction"],
    "Respiratory": ["pulmonary", "lung", "respiratory", "bronchial", "pneumonia",
                    "dyspnea", "cough", "pleural", "trachea", "asthma", "copd"],
    "Neurological": ["neural", "brain", "cerebral", "spinal", "seizure",
                     "meningitis", "headache", "neurological", "stroke",
                     "dementia", "parkinson", "epilepsy", "migraine"],
    "Gastrointestinal": ["gastric", "intestinal", "hepatic", "pancreatic",
                         "bowel", "colon", "liver", "esophageal", "rectal",
                         "appendix", "ulcer", "crohn", "ibs"],
    "Musculoskeletal": ["bone", "joint", "muscle", "fracture", "arthritis",
                        "spinal", "vertebral", "tendon", "cartilage", "osteo"],
    "Endocrine": ["thyroid", "diabetes", "insulin", "hormone", "adrenal",
                  "pituitary", "glucose", "endocrine", "metabolic"],
    "Renal": ["kidney", "renal", "urinary", "bladder", "nephro", "dialysis",
              "glomerular", "creatinine"],
    "Dermatology": ["skin", "derma", "rash", "psoriasis", "eczema", "melanoma",
                    "lesion", "wound", "burn"],
}

SPECIALTY_MAP: dict[str, list[str]] = {
    "Cardiology":       ["hypertension", "heart", "cardiac", "coronary", "arrhythmia"],
    "Pulmonology":      ["pneumonia", "asthma", "copd", "respiratory", "lung"],
    "Neurology":        ["migraine", "epilepsy", "stroke", "neurological", "parkinson"],
    "Gastroenterology": ["gerd", "gastric", "liver", "hepatitis", "ibs", "crohn"],
    "Endocrinology":    ["diabetes", "thyroid", "insulin", "metabolic"],
    "Dermatology":      ["eczema", "psoriasis", "dermatitis", "skin"],
    "Rheumatology":     ["arthritis", "lupus", "autoimmune", "fibromyalgia"],
    "Oncology":         ["cancer", "tumor", "carcinoma", "malignant", "lymphoma"],
}

# ── Synthetic data specs ───────────────────────────────────────────────────────

_SYNTH_CASES = [
    {
        "system": "Cardiac",
        "entities": ["Sign_symptom", "Disease_disorder", "Diagnostic_procedure"],
        "narrative_template": (
            "A {age}-year-old {gender} presented to the emergency department with a {duration}-day "
            "history of {symptom1} and {symptom2}. Past medical history was notable for {history}. "
            "Physical examination revealed {finding}. ECG demonstrated {ecg_finding}. "
            "Echocardiography showed {echo_finding}. Troponin was {troponin}. "
            "The patient was diagnosed with {diagnosis} and {treatment}."
        ),
        "slots": {
            "symptom1": ["chest pain", "palpitations", "shortness of breath", "dizziness"],
            "symptom2": ["dyspnea on exertion", "orthopnea", "ankle oedema", "syncope"],
            "history": ["hypertension", "type 2 diabetes", "hyperlipidaemia", "prior MI"],
            "finding": ["elevated JVP", "S3 gallop", "bilateral basal crepitations", "irregular rhythm"],
            "ecg_finding": ["ST-elevation in leads II, III, aVF", "atrial fibrillation", "left bundle branch block", "QTc prolongation"],
            "echo_finding": ["reduced ejection fraction of 35%", "regional wall motion abnormality", "mitral regurgitation", "pericardial effusion"],
            "troponin": ["markedly elevated", "mildly elevated", "within normal limits"],
            "diagnosis": ["acute NSTEMI", "decompensated heart failure", "new-onset atrial fibrillation", "hypertensive urgency"],
            "treatment": ["started on dual antiplatelet therapy and transferred for PCI", "commenced on diuretics and ACE inhibitor", "rate-controlled with metoprolol", "managed with IV antihypertensives"],
        },
    },
    {
        "system": "Respiratory",
        "entities": ["Sign_symptom", "Disease_disorder", "Medication"],
        "narrative_template": (
            "A {age}-year-old {gender} was admitted with a {duration}-week history of {symptom1}. "
            "The patient also reported {symptom2} and {symptom3}. "
            "Relevant history included {history}. Chest X-ray demonstrated {xray_finding}. "
            "CT thorax revealed {ct_finding}. Bronchoscopy showed {bronch_finding}. "
            "Pulmonary function tests indicated {pft}. "
            "The diagnosis of {diagnosis} was established and {treatment} was initiated."
        ),
        "slots": {
            "symptom1": ["progressive dyspnoea", "productive cough", "haemoptysis", "pleuritic chest pain"],
            "symptom2": ["night sweats", "weight loss", "fever", "fatigue"],
            "symptom3": ["wheeze", "stridor", "hoarseness", "ankle swelling"],
            "history": ["smoking (40 pack-years)", "occupational asbestos exposure", "prior tuberculosis", "immunosuppression"],
            "xray_finding": ["bilateral infiltrates", "right upper lobe consolidation", "pleural effusion", "hyperinflation"],
            "ct_finding": ["ground-glass opacification", "honeycombing pattern", "mediastinal lymphadenopathy", "cavitating lesion"],
            "bronch_finding": ["mucosal inflammation", "endobronchial tumour", "purulent secretions", "normal mucosa"],
            "pft": ["obstructive pattern with FEV1/FVC 0.58", "restrictive pattern", "mixed pattern", "normal spirometry"],
            "diagnosis": ["community-acquired pneumonia", "pulmonary fibrosis", "lung adenocarcinoma", "pulmonary embolism"],
            "treatment": ["broad-spectrum antibiotics", "high-dose corticosteroids", "palliative chemotherapy", "anticoagulation with low-molecular-weight heparin"],
        },
    },
    {
        "system": "Neurological",
        "entities": ["Sign_symptom", "Disease_disorder", "Diagnostic_procedure", "Medication"],
        "narrative_template": (
            "A {age}-year-old {gender} presented with sudden onset of {symptom1} and {symptom2}. "
            "Neurological examination revealed {finding1} and {finding2}. "
            "History included {history}. MRI brain showed {mri_finding}. "
            "CSF analysis demonstrated {csf_finding}. EEG was {eeg}. "
            "The patient was diagnosed with {diagnosis}. Treatment comprised {treatment} "
            "with {outcome} at discharge."
        ),
        "slots": {
            "symptom1": ["severe headache", "focal weakness", "speech disturbance", "altered consciousness"],
            "symptom2": ["neck stiffness", "photophobia", "visual disturbance", "ataxia"],
            "finding1": ["left-sided hemiplegia", "right facial droop", "papilloedema", "positive Kernig's sign"],
            "finding2": ["dysphasia", "hyperreflexia", "cerebellar signs", "cranial nerve palsy"],
            "history": ["hypertension", "atrial fibrillation on anticoagulation", "prior stroke", "HIV-positive status"],
            "mri_finding": ["acute territorial infarct in MCA distribution", "ring-enhancing lesion", "diffuse leptomeningeal enhancement", "haemorrhagic transformation"],
            "csf_finding": ["elevated protein and pleocytosis", "xanthochromia", "normal constituents", "oligoclonal bands"],
            "eeg": ["generalised spike-and-wave discharges", "focal slowing", "normal", "burst suppression pattern"],
            "diagnosis": ["ischaemic stroke", "bacterial meningitis", "primary CNS lymphoma", "status epilepticus"],
            "treatment": ["IV alteplase thrombolysis followed by antiplatelet therapy", "IV ceftriaxone and dexamethasone", "dexamethasone and whole-brain radiotherapy", "IV levetiracetam and phenytoin"],
            "outcome": ["significant motor improvement", "moderate functional recovery", "stable neurological deficit", "complete resolution of symptoms"],
        },
    },
    {
        "system": "Gastrointestinal",
        "entities": ["Sign_symptom", "Disease_disorder", "Diagnostic_procedure"],
        "narrative_template": (
            "A {age}-year-old {gender} presented with {symptom1} of {duration} weeks duration, "
            "associated with {symptom2} and {symptom3}. "
            "Laboratory results revealed {labs}. "
            "Endoscopy demonstrated {endo_finding}. CT abdomen showed {ct_finding}. "
            "Liver biopsy confirmed {biopsy}. "
            "Diagnosis: {diagnosis}. {treatment} was commenced."
        ),
        "slots": {
            "symptom1": ["progressive dysphagia", "upper abdominal pain", "rectal bleeding", "jaundice"],
            "symptom2": ["weight loss of 8 kg", "nausea and vomiting", "altered bowel habit", "pruritus"],
            "symptom3": ["anorexia", "early satiety", "dark urine", "pale stools"],
            "labs": ["iron-deficiency anaemia", "elevated liver enzymes (AST/ALT 4× ULN)", "hypoalbuminaemia", "elevated CA19-9"],
            "endo_finding": ["ulcerating mass at the gastro-oesophageal junction", "Barrett's oesophagus with high-grade dysplasia", "multiple colonic polyps", "oesophageal varices grade III"],
            "ct_finding": ["hepatic metastases", "portal hypertension with splenomegaly", "circumferential colonic thickening", "intrahepatic biliary dilatation"],
            "biopsy": ["cirrhosis with bridging fibrosis", "hepatocellular carcinoma", "Crohn's disease", "adenocarcinoma"],
            "diagnosis": ["oesophageal adenocarcinoma", "decompensated cirrhosis", "colorectal cancer", "primary sclerosing cholangitis"],
            "treatment": ["neoadjuvant chemoradiotherapy", "diuretics, propranolol, and dietary sodium restriction", "surgical resection (right hemicolectomy)", "ERCP with stenting"],
        },
    },
    {
        "system": "Musculoskeletal",
        "entities": ["Sign_symptom", "Disease_disorder", "Medication"],
        "narrative_template": (
            "A {age}-year-old {gender} presented with {symptom1} affecting the {joint}, "
            "associated with {symptom2}. Duration of symptoms was {duration} months. "
            "Blood tests showed {labs}. X-ray of the {joint} revealed {xray}. "
            "MRI demonstrated {mri}. Synovial fluid analysis showed {fluid}. "
            "Diagnosis: {diagnosis}. Management included {treatment}."
        ),
        "slots": {
            "symptom1": ["pain and swelling", "progressive stiffness", "reduced range of motion", "instability"],
            "joint": ["knee", "hip", "wrist and MCPs", "spine", "shoulder"],
            "symptom2": ["morning stiffness lasting > 1 hour", "nocturnal pain", "constitutional symptoms", "skin rash"],
            "labs": ["elevated CRP and ESR", "positive RF and anti-CCP antibodies", "elevated uric acid", "ANA positive, anti-dsDNA elevated"],
            "xray": ["joint space narrowing and osteophytes", "periarticular erosions", "soft tissue swelling", "chondrocalcinosis"],
            "mri": ["synovitis and bone marrow oedema", "meniscal tear", "rotator cuff rupture", "sacroiliitis"],
            "fluid": ["inflammatory aspirate with elevated WBC", "negatively birefringent crystals", "haemarthrosis", "non-inflammatory aspirate"],
            "diagnosis": ["rheumatoid arthritis", "gout", "osteoarthritis", "systemic lupus erythematosus"],
            "treatment": ["methotrexate and hydroxychloroquine", "colchicine and allopurinol", "total knee replacement", "hydroxychloroquine and low-dose prednisolone"],
        },
    },
    {
        "system": "Dermatology",
        "entities": ["Sign_symptom", "Disease_disorder", "Diagnostic_procedure"],
        "narrative_template": (
            "A {age}-year-old {gender} was referred to the dermatology clinic following {referral_reason}. "
            "The patient reported a {duration}-month history of {symptom1}. "
            "Examination revealed {lesion_description} on the {location}. "
            "Dermoscopy demonstrated {dermoscopy_finding}. "
            "Skin biopsy showed {biopsy_result}. "
            "Relevant history included {history}. "
            "Diagnosis: {diagnosis}. {treatment} was recommended."
        ),
        "slots": {
            "referral_reason": ["a suspicious pigmented lesion noted by GP", "routine dermatology screening", "a rapidly changing mole", "a non-healing ulcerated lesion"],
            "symptom1": ["a changing skin lesion", "pruritic rash", "a new pigmented lesion", "skin thickening with scaling"],
            "lesion_description": ["an asymmetric pigmented lesion with irregular border and colour variation", "a pearly nodule with telangiectasia", "an erythematous plaque with silvery scaling", "a corrosion-pattern lesion with irregular border and satellite nodules"],
            "location": ["left forearm", "upper back", "face and scalp", "lower leg"],
            "dermoscopy_finding": ["atypical pigment network with regression structures", "arborising vessels and blue-grey ovoid nests", "Munro microabscesses pattern", "irregular vascular pattern with white streaks"],
            "biopsy_result": ["malignant melanoma with Breslow thickness 1.2 mm", "nodular basal cell carcinoma", "psoriasis with acanthosis and parakeratosis", "squamous cell carcinoma in situ"],
            "history": ["prolonged sun exposure", "family history of melanoma", "immunosuppression post-renal transplant", "prior basal cell carcinoma"],
            "diagnosis": ["malignant melanoma stage IB", "nodular basal cell carcinoma", "plaque psoriasis", "Bowen's disease (SCC in situ)"],
            "treatment": ["wide local excision with 1 cm margins and sentinel lymph node biopsy", "surgical excision with 4 mm margins", "topical corticosteroids and phototherapy", "topical 5-fluorouracil cream"],
        },
    },
    {
        "system": "Paediatric",
        "entities": ["Sign_symptom", "Disease_disorder", "Diagnostic_procedure"],
        "narrative_template": (
            "A {age}-year-old {gender} was brought to the paediatric emergency department by parents with a {duration}-day history of {symptom1} and {symptom2}. "
            "On examination the child was {examination_finding}. "
            "Oxygen saturation was {sats}. "
            "Chest auscultation revealed {auscultation}. "
            "CXR showed {cxr}. Blood cultures {cultures}. "
            "History included {history}. "
            "Diagnosis: {diagnosis}. {treatment} was initiated."
        ),
        "slots": {
            "symptom1": ["fever", "respiratory distress", "stridor", "wheeze"],
            "symptom2": ["reduced oral intake", "barking cough", "sudden onset unilateral wheeze", "increased work of breathing"],
            "examination_finding": ["tachycardic and tachypnoeic with subcostal recession", "febrile at 38.9°C with inspiratory stridor", "afebrile with unilateral reduced air entry and wheeze", "pale and lethargic with intercostal recession"],
            "sats": ["91% on room air", "94% on room air", "88% requiring supplemental oxygen", "96% on room air"],
            "auscultation": ["bilateral coarse crackles", "unilateral reduced breath sounds with wheeze consistent with foreign body aspiration", "expiratory wheeze bilaterally", "tubular breathing at right base"],
            "cxr": ["right lower lobe consolidation", "air trapping on expiratory film suggesting bronchial foreign body", "hyperinflation bilaterally", "left-sided pneumothorax"],
            "cultures": ["grew Streptococcus pneumoniae", "were negative", "grew Staphylococcus aureus", "were pending at time of treatment"],
            "history": ["no prior hospital admissions", "recent choking episode on food", "recurrent wheeze since infancy", "premature birth at 32 weeks"],
            "diagnosis": ["community-acquired pneumonia", "suspected foreign body aspiration", "viral-induced wheeze", "croup (laryngotracheobronchitis)"],
            "treatment": ["IV amoxicillin-clavulanate", "urgent rigid bronchoscopy under general anaesthesia", "salbutamol nebulisers and oral prednisolone", "nebulised adrenaline and oral dexamethasone"],
        },
    },
]

_AGES = list(range(18, 85))
_GENDERS = ["male", "female"]
_DURATIONS = [1, 2, 3, 5, 7, 10, 14, 21, 28]


def _generate_synthetic_cases(n: int = 200) -> list[dict[str, Any]]:
    """Generate n synthetic clinical case records."""
    rng = random.Random(42)
    records = []
    today = date.today()

    for i in range(n):
        template_spec = rng.choice(_SYNTH_CASES)
        age = rng.choice(_AGES)
        gender = rng.choice(_GENDERS)
        duration = rng.choice(_DURATIONS)

        # Fill template slots
        slots: dict[str, str] = {"age": str(age), "gender": gender, "duration": str(duration)}
        for slot, options in template_spec["slots"].items():
            slots[slot] = rng.choice(options)

        narrative = template_spec["narrative_template"].format(**slots)

        # Extract corrective_action sentences
        sentences = [s.strip() for s in narrative.replace(".", ". ").split(". ") if s.strip()]
        treatment_sents = [
            s for s in sentences
            if any(kw in s.lower() for kw in TREATMENT_KEYWORDS)
        ]
        corrective_action = ". ".join(treatment_sents) or ". ".join(sentences[-2:])

        # Severity from age + keyword patterns
        narrative_lower = narrative.lower()
        if any(kw in narrative_lower for kw in ["emergency", "critical", "sepsis", "cardiac arrest", "death"]):
            severity = "Critical"
        elif any(kw in narrative_lower for kw in ["acute", "severe", "elevated troponin", "icu", "admitted"]):
            severity = "High"
        elif any(kw in narrative_lower for kw in ["moderate", "progressive", "chronic"]):
            severity = "Medium"
        else:
            severity = "Low"

        event_date = today - timedelta(days=rng.randint(1, 730))
        # Use rng for UUID so the same 200 case_ids are generated every run.
        # uuid.uuid4() (unseeded) would create new UUIDs on each restart,
        # causing ON CONFLICT DO NOTHING to insert duplicates and grow medical_cases unboundedly.
        case_id = str(uuid.UUID(int=rng.getrandbits(128)))

        records.append({
            "case_id": case_id,
            "system": template_spec["system"],
            "sub_system": None,
            "event_date": event_date.isoformat(),
            "severity": severity,
            "narrative": narrative,
            "corrective_action": corrective_action,
            "entities": json.dumps(template_spec["entities"]),
            "source": "synthetic",
        })

    return records


def _generate_synthetic_disease_records(n: int = 500) -> list[dict[str, Any]]:
    """Generate n synthetic disease/symptom records."""
    rng = random.Random(123)
    diseases = [
        ("Hypertension", "Cardiology"),
        ("Type 2 Diabetes", "Endocrinology"),
        ("Pneumonia", "Pulmonology"),
        ("Asthma", "Pulmonology"),
        ("Migraine", "Neurology"),
        ("Epilepsy", "Neurology"),
        ("GERD", "Gastroenterology"),
        ("Rheumatoid Arthritis", "Rheumatology"),
        ("Hypothyroidism", "Endocrinology"),
        ("Coronary Artery Disease", "Cardiology"),
        ("Chronic Kidney Disease", "Nephrology"),
        ("Anemia", "General Medicine"),
    ]
    records = []
    today = date.today()

    for i in range(n):
        disease, specialty = rng.choice(diseases)
        age = rng.randint(20, 80)
        gender = rng.choice(["Male", "Female"])
        outcome = rng.choice(["Positive", "Negative"])
        severity = "High" if outcome == "Positive" else rng.choice(["Medium", "Low"])

        records.append({
            "record_id": str(uuid.uuid4()),
            "disease": disease,
            "fever": rng.random() < 0.4,
            "cough": rng.random() < 0.35,
            "fatigue": rng.random() < 0.55,
            "difficulty_breathing": rng.random() < 0.25,
            "age": age,
            "gender": gender,
            "blood_pressure": rng.choice(["Normal", "High"]),
            "cholesterol_level": rng.choice(["Normal", "High"]),
            "outcome": outcome,
            "severity": severity,
            "specialty": specialty,
            "inspection_date": (today - timedelta(days=rng.randint(1, 365))).isoformat(),
            "source": "synthetic",
        })

    return records


def _derive_body_system(text_lower: str) -> str:
    for system, keywords in BODY_SYSTEM_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return system
    return "General"


def _derive_specialty(disease: str) -> str:
    disease_lower = disease.lower()
    for specialty, keywords in SPECIALTY_MAP.items():
        if any(kw in disease_lower for kw in keywords):
            return specialty
    return "General Medicine"


# ── MACCROBAT loader ──────────────────────────────────────────────────────────


def _load_maccrobat(limit: int = 200) -> list[dict[str, Any]]:
    """
    Attempt to load MACCROBAT from HuggingFace datasets library.
    Falls back to synthetic data if the library is not installed or network is unavailable.
    """
    try:
        from datasets import load_dataset  # type: ignore
        logger.info("Loading MACCROBAT from HuggingFace...")
        dataset = load_dataset("singh-aditya/MACCROBAT_biomedical_ner", split="train")

        records = []
        today = date.today()
        rng = random.Random(42)

        for i, row in enumerate(dataset):
            if i >= limit:
                break

            full_text: str = row.get("full_text", "") or ""
            if not full_text.strip():
                continue

            ner_labels: list[str] = row.get("ner_labels", []) or []
            entity_types = list({
                lbl.replace("B-", "").replace("I-", "")
                for lbl in ner_labels
                if lbl not in ("O", "")
            })

            # Extract treatment sentences
            sentences = [s.strip() for s in full_text.replace("\n", " ").split(". ") if s.strip()]
            treatment_sents = [
                s for s in sentences
                if any(kw in s.lower() for kw in TREATMENT_KEYWORDS)
            ]
            corrective_action = ". ".join(treatment_sents[:3]) or ". ".join(sentences[-2:])

            # Derive severity
            text_lower = full_text.lower()
            if any(kw in text_lower for kw in ["emergency", "critical", "death", "died", "fatal", "cardiac arrest"]):
                severity = "Critical"
            elif len(entity_types) >= 4 and "Disease_disorder" in entity_types:
                severity = "High"
            elif "Sign_symptom" in entity_types:
                severity = "Medium"
            else:
                severity = "Low"

            body_system = _derive_body_system(text_lower)
            event_date = today - timedelta(days=rng.randint(1, 730))

            records.append({
                "case_id": str(uuid.uuid4()),
                "system": body_system,
                "sub_system": None,
                "event_date": event_date.isoformat(),
                "severity": severity,
                "narrative": full_text[:8000],  # cap very long narratives
                "corrective_action": corrective_action,
                "entities": json.dumps(entity_types),
                "source": "maccrobat",
            })

        logger.info("MACCROBAT loaded", extra={"records": len(records)})
        return records

    except Exception as exc:
        logger.warning(
            "MACCROBAT unavailable — using synthetic medical cases",
            extra={"reason": str(exc)},
        )
        return _generate_synthetic_cases(limit)


# ── Disease Symptoms CSV loader ───────────────────────────────────────────────


def _load_disease_csv(path: str = "data/disease-symptoms-patient-profile.csv") -> list[dict[str, Any]]:
    """
    Load Disease Symptoms & Patient Profile CSV from Kaggle.
    Falls back to synthetic records if the file is not present.

    Download from:
    kaggle.com/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset
    """
    csv_path = Path(path)
    if not csv_path.exists():
        logger.warning(
            "Disease Symptoms CSV not found — using synthetic disease records",
            extra={"path": str(csv_path)},
        )
        logger.info(
            "To use real data: download from "
            "kaggle.com/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset "
            f"and save to {csv_path}"
        )
        return _generate_synthetic_disease_records(500)

    df = pd.read_csv(csv_path)
    logger.info("Disease CSV loaded", extra={"rows": len(df), "columns": list(df.columns)})

    def _yn(val: Any) -> bool | None:
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.strip().lower() == "yes"
        return None

    records = []
    today = date.today()
    rng = random.Random(99)

    for _, row in df.iterrows():
        disease = str(row.get("Disease", "Unknown")).strip()
        outcome = str(row.get("Outcome Variable", "Negative")).strip()
        severity = "High" if outcome == "Positive" else "Low"

        try:
            age = int(row.get("Age", 40))
        except (ValueError, TypeError):
            age = 40

        records.append({
            "record_id": str(uuid.uuid4()),
            "disease": disease,
            "fever": _yn(row.get("Fever")),
            "cough": _yn(row.get("Cough")),
            "fatigue": _yn(row.get("Fatigue")),
            "difficulty_breathing": _yn(row.get("Difficulty Breathing")),
            "age": age,
            "gender": str(row.get("Gender", "Unknown")).strip(),
            "blood_pressure": str(row.get("Blood Pressure", "Normal")).strip(),
            "cholesterol_level": str(row.get("Cholesterol Level", "Normal")).strip(),
            "outcome": outcome,
            "severity": severity,
            "specialty": _derive_specialty(disease),
            "inspection_date": (today - timedelta(days=rng.randint(1, 365))).isoformat(),
            "source": "kaggle",
        })

    return records


# ── DB upsert helpers ─────────────────────────────────────────────────────────


def _upsert_cases(session, cases: list[dict[str, Any]]) -> int:
    inserted = 0
    for row in cases:
        try:
            session.execute(
                text(
                    "INSERT INTO medical_cases "
                    "(case_id, system, sub_system, event_date, severity, narrative, "
                    "corrective_action, entities, source) "
                    "VALUES (:case_id, :system, :sub_system, :event_date, :severity, :narrative, "
                    ":corrective_action, :entities, :source) "
                    "ON CONFLICT (case_id) DO NOTHING"
                ),
                row,
            )
            inserted += 1
        except Exception as exc:
            logger.warning("medical_cases insert failed", extra={"error": str(exc)})
    session.commit()
    return inserted


def _upsert_disease_records(session, records: list[dict[str, Any]]) -> int:
    inserted = 0
    for row in records:
        try:
            session.execute(
                text(
                    "INSERT INTO disease_records "
                    "(record_id, disease, fever, cough, fatigue, difficulty_breathing, "
                    "age, gender, blood_pressure, cholesterol_level, outcome, severity, "
                    "specialty, inspection_date, source) "
                    "VALUES (:record_id, :disease, :fever, :cough, :fatigue, "
                    ":difficulty_breathing, :age, :gender, :blood_pressure, "
                    ":cholesterol_level, :outcome, :severity, :specialty, "
                    ":inspection_date, :source) "
                    "ON CONFLICT (record_id) DO NOTHING"
                ),
                row,
            )
            inserted += 1
        except Exception as exc:
            logger.warning("disease_records insert failed", extra={"error": str(exc)})
    session.commit()
    return inserted


def _embed_medical_cases(session, batch_size: int = 256) -> int:
    """
    Chunk and embed all medical_cases that don't have embeddings yet.
    Idempotent: skips already-embedded cases.
    """
    result = session.execute(text(
        """
        SELECT mc.case_id, mc.narrative
        FROM medical_cases mc
        LEFT JOIN medical_embeddings me ON me.case_id = mc.case_id
        WHERE me.embed_id IS NULL AND mc.narrative IS NOT NULL AND mc.narrative != ''
        """
    ))
    cases = result.fetchall()

    if not cases:
        logger.info("All medical cases already embedded — skipping")
        return 0

    logger.info("Embedding medical cases", extra={"count": len(cases)})
    model = EmbeddingModel.get()

    chunk_records: list[dict[str, Any]] = []
    for case_id, narrative in cases:
        chunks = chunk_text(narrative, chunk_size=400, overlap=75)
        for chunk in chunks:
            chunk_records.append({
                "embed_id": str(uuid.uuid4()),
                "case_id": case_id,
                "chunk_index": chunk["chunk_index"],
                "chunk_text": chunk["chunk_text"],
                "char_start": chunk["char_start"],
                "char_end": chunk["char_end"],
                "embedding": None,
            })

    total_stored = 0
    for batch_start in range(0, len(chunk_records), batch_size):
        batch = chunk_records[batch_start: batch_start + batch_size]
        texts = [r["chunk_text"] for r in batch]
        vectors = model.encode(texts)

        for record, vector in zip(batch, vectors):
            record["embedding"] = vector.tolist()

        for record in batch:
            try:
                session.execute(
                    text(
                        "INSERT INTO medical_embeddings "
                        "(embed_id, case_id, chunk_index, chunk_text, embedding, char_start, char_end) "
                        "VALUES (:embed_id, :case_id, :chunk_index, :chunk_text, :embedding, "
                        ":char_start, :char_end) "
                        "ON CONFLICT (embed_id) DO NOTHING"
                    ),
                    {**record, "embedding": str(record["embedding"])},
                )
                total_stored += 1
            except Exception as exc:
                logger.warning("Medical chunk insert failed", extra={"error": str(exc)})
        session.commit()
        logger.info(
            "Medical embedding batch stored",
            extra={"batch": batch_start // batch_size + 1, "stored_so_far": total_stored},
        )

    return total_stored


# ── Main entry point ──────────────────────────────────────────────────────────


def run_medical_ingest_pipeline(
    maccrobat_limit: int = 200,
    disease_csv_path: str = "data/disease-symptoms-patient-profile.csv",
) -> dict[str, Any]:
    """
    Execute the full medical domain ingest pipeline.

    1. Load MACCROBAT (or synthetic) → medical_cases
    2. Load Disease Symptoms CSV (or synthetic) → disease_records
    3. Chunk + embed medical_cases → medical_embeddings

    Returns summary dict with row counts.
    """
    summary: dict[str, Any] = {
        "cases_loaded": 0,
        "disease_records_loaded": 0,
        "chunks_embedded": 0,
        "graph_nodes": 0,
        "graph_edges": 0,
        "status": "running",
    }

    try:
        logger.info("Medical ingest pipeline starting")

        # Phase 1: medical_cases
        cases = _load_maccrobat(limit=maccrobat_limit)
        with get_sync_session() as session:
            summary["cases_loaded"] = _upsert_cases(session, cases)
        logger.info("medical_cases loaded", extra={"count": summary["cases_loaded"]})

        # Phase 2: disease_records
        disease_rows = _load_disease_csv(disease_csv_path)
        with get_sync_session() as session:
            summary["disease_records_loaded"] = _upsert_disease_records(session, disease_rows)
        logger.info("disease_records loaded", extra={"count": summary["disease_records_loaded"]})

        # Phase 3: embed
        with get_sync_session() as session:
            summary["chunks_embedded"] = _embed_medical_cases(session)
        logger.info("Medical embeddings stored", extra={"count": summary["chunks_embedded"]})

        # Phase 4: build knowledge graph from medical embeddings
        with get_sync_session() as session:
            graph_result = build_graph(session, domain="medical")
        summary["graph_nodes"] = graph_result["nodes"]
        summary["graph_edges"] = graph_result["edges"]
        logger.info("Medical knowledge graph built", extra=graph_result)

        summary["status"] = "complete"
        logger.info("Medical ingest pipeline complete", extra=summary)

    except Exception as exc:
        summary["status"] = "failed"
        summary["error"] = str(exc)
        logger.error("Medical ingest pipeline failed", extra={"error": str(exc)})
        raise

    return summary
