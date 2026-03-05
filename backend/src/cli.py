"""
NextAgentAI CLI — developer-facing command-line interface.

Usage:
    python -m src.cli ingest --config config.yaml
    python -m src.cli ask "Find similar incidents to: hydraulic actuator crack on Line 1"
    python -m src.cli ask "Show defect trends by product for last 90 days"
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def _load_env() -> None:
    """Load .env file if present."""
    env_path = Path(".env")
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(str(env_path))
        print("[cli] Loaded .env file")


def cmd_ingest(args: argparse.Namespace) -> None:
    """Run the full ingest pipeline."""
    _load_env()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"[cli] ERROR: config file not found: {config_path}")
        sys.exit(1)

    print(f"[cli] Starting ingest pipeline (config: {config_path})")
    print("[cli] This may take 3–5 minutes for 10k synthetic incidents + embeddings...")

    from backend.app.ingest.pipeline import run_ingest_pipeline
    try:
        summary = run_ingest_pipeline()
        print("\n[cli] Ingest complete:")
        print(f"  Incidents loaded:   {summary['incidents_loaded']:,}")
        print(f"  Defects loaded:     {summary['defects_loaded']:,}")
        print(f"  Maintenance loaded: {summary['maintenance_loaded']:,}")
        print(f"  Chunks embedded:    {summary['chunks_embedded']:,}")
        print(f"  Graph nodes:        {summary['graph_nodes']:,}")
        print(f"  Graph edges:        {summary['graph_edges']:,}")
        print(f"  Status: {summary['status']}")
    except Exception as exc:
        print(f"[cli] ERROR: {exc}")
        sys.exit(1)


def cmd_ask(args: argparse.Namespace) -> None:
    """Run a query through the agent orchestrator and print results."""
    _load_env()

    query = args.query
    print(f"\n[cli] Query: {query}")
    print("[cli] Running agent (this may take 10–30s)...\n")

    from backend.app.agent.orchestrator import AgentOrchestrator
    try:
        orchestrator = AgentOrchestrator()
        result = orchestrator.run(query)
    except Exception as exc:
        print(f"[cli] ERROR: {exc}")
        sys.exit(1)

    # Pretty-print results
    print("=" * 70)
    print(f"Run ID:   {result.run_id}")
    print(f"Intent:   {result.run_summary.get('intent', 'N/A')}")
    print(f"Latency:  {result.run_summary.get('total_latency_ms', 0):.0f}ms")
    print("=" * 70)
    print()

    print("PLAN:")
    print(result.run_summary.get("plan_text", "No plan generated"))
    print()

    print("ANSWER:")
    print(result.answer)
    print()

    if result.claims:
        print("CLAIMS:")
        for i, claim in enumerate(result.claims, 1):
            conf = claim.get("confidence", 0.0)
            text = claim.get("text", "")
            citations = claim.get("citations", [])
            print(f"  [{i}] (confidence: {conf:.2f}) {text}")
            for c in citations[:2]:
                print(f"       Citation: incident={c.get('incident_id')} chunk={c.get('chunk_id')}")
        print()

    vector_hits = result.evidence.get("vector_hits", []) if isinstance(result.evidence, dict) else []
    if vector_hits:
        print(f"EVIDENCE — Vector Hits ({len(vector_hits)}):")
        for hit in vector_hits[:3]:
            print(f"  Score {hit.get('score', 0):.3f} | {hit.get('incident_id')} | {hit.get('excerpt', '')[:100]}...")
        print()

    sql_rows = result.evidence.get("sql_rows", []) if isinstance(result.evidence, dict) else []
    if sql_rows:
        print(f"EVIDENCE — SQL Results ({len(sql_rows)} queries):")
        for sr in sql_rows:
            print(f"  Query: {sr.get('query', '')} — {sr.get('row_count', 0)} rows")
        print()

    if result.next_steps:
        print("NEXT STEPS:")
        for step in result.next_steps[:3]:
            print(f"  • {step}")
        print()

    if args.json:
        print("\n--- Full JSON Output ---")
        print(json.dumps(result.to_dict(), indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m src.cli",
        description="NextAgentAI — Agentic Manufacturing Intelligence CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # ingest subcommand
    ingest_parser = subparsers.add_parser("ingest", help="Run the full data ingestion pipeline")
    ingest_parser.add_argument(
        "--config",
        default="config.yaml",
        help="Path to config.yaml (default: config.yaml)",
    )

    # ask subcommand
    ask_parser = subparsers.add_parser("ask", help="Ask a question using the agent")
    ask_parser.add_argument("query", help="Natural language question")
    ask_parser.add_argument("--json", action="store_true", help="Also print full JSON output")

    args = parser.parse_args()

    if args.command == "ingest":
        cmd_ingest(args)
    elif args.command == "ask":
        cmd_ask(args)


if __name__ == "__main__":
    main()
