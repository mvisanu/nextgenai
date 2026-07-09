"""
Graph RAG unit tests — builder ID determinism, canonical edges, scorer
conflict detection, expander dedup, and orchestrator graph_path truncation.

All tests are pure-Python (fake sessions) — no live PostgreSQL required.
"""
from __future__ import annotations

import json
from typing import Any

import pytest


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeRow:
    def __init__(self, **kw: Any) -> None:
        self.__dict__.update(kw)


class _FakeResult:
    def __init__(self, rows: list[Any] | None = None, scalar: Any = None) -> None:
        self._rows = rows or []
        self._scalar = scalar

    def fetchall(self) -> list[Any]:
        return self._rows

    def scalar(self) -> Any:
        return self._scalar


class _BuilderFakeSession:
    """Routes builder SQL: returns embedding rows for SELECTs, records INSERTs."""

    def __init__(self, embed_rows: list[Any]) -> None:
        self.embed_rows = embed_rows
        self.node_rows: list[dict] = []
        self.edge_rows: list[dict] = []
        self.commits = 0

    def execute(self, sql: Any, params: Any = None) -> _FakeResult:
        stmt = str(sql)
        if "FROM incident_embeddings" in stmt or "FROM medical_embeddings" in stmt:
            return _FakeResult(rows=self.embed_rows)
        if "INSERT INTO graph_node" in stmt:
            self.node_rows.extend(params if isinstance(params, list) else [params])
            return _FakeResult()
        if "INSERT INTO graph_edge" in stmt:
            self.edge_rows.extend(params if isinstance(params, list) else [params])
            return _FakeResult()
        if "SELECT COUNT(*) FROM graph_node" in stmt:
            return _FakeResult(scalar=len(self.node_rows))
        if "SELECT COUNT(*) FROM graph_edge" in stmt:
            return _FakeResult(scalar=len(self.edge_rows))
        return _FakeResult()

    def commit(self) -> None:
        self.commits += 1


def _embed_row(embed_id: str, incident_id: str, text: str) -> _FakeRow:
    return _FakeRow(
        embed_id=embed_id,
        incident_id=incident_id,
        chunk_text=text,
        embedding=None,  # skip similarity phase
    )


# ---------------------------------------------------------------------------
# builder.py
# ---------------------------------------------------------------------------


class TestStableHash:
    def test_deterministic(self):
        from backend.app.graph.builder import _stable_hash

        assert _stable_hash("system:hydraulic") == _stable_hash("system:hydraulic")

    def test_distinct_keys_distinct_hashes(self):
        from backend.app.graph.builder import _stable_hash

        assert _stable_hash("system:hydraulic") != _stable_hash("system:pneumatic")

    def test_length_16_hex(self):
        from backend.app.graph.builder import _stable_hash

        h = _stable_hash("anything")
        assert len(h) == 16
        int(h, 16)  # raises if not hex


class TestBuildGraph:
    def _run(self, rows):
        from backend.app.graph.builder import build_graph

        session = _BuilderFakeSession(rows)
        result = build_graph(session, domain="aircraft")
        return session, result

    def test_entity_ids_deterministic_across_builds(self):
        rows = [_embed_row("e1", "INC-1", "hydraulic pump crack found")]
        s1, _ = self._run(rows)
        s2, _ = self._run(rows)
        ids1 = {r["id"] for r in s1.node_rows if r["type"] == "entity"}
        ids2 = {r["id"] for r in s2.node_rows if r["type"] == "entity"}
        assert ids1 == ids2  # random uuids would differ per run

    def test_properties_are_valid_json(self):
        rows = [_embed_row("e1", "INC-1", 'narrative with "quotes" and hydraulic pump')]
        session, _ = self._run(rows)
        for row in session.node_rows:
            props = json.loads(row["properties"])
            assert isinstance(props, dict)

    def test_cooc_edges_canonical_no_reverse_duplicates(self):
        # Same entity pair in both orders across two chunks → single cooc edge
        rows = [
            _embed_row("e1", "INC-1", "hydraulic pump failure"),
            _embed_row("e2", "INC-2", "pump on the hydraulic line"),
        ]
        session, _ = self._run(rows)
        cooc = [r for r in session.edge_rows if r["type"] == "co_occurrence"]
        pairs = {(r["from_node"], r["to_node"]) for r in cooc}
        assert len(cooc) == len(pairs)
        for a, b in pairs:
            assert (b, a) not in pairs
            assert a < b  # canonical ordering

    def test_mentions_deduped_within_chunk(self):
        rows = [_embed_row("e1", "INC-1", "pump pump pump hydraulic")]
        session, _ = self._run(rows)
        mentions = [r for r in session.edge_rows if r["type"] == "mentions"]
        assert len({r["id"] for r in mentions}) == len(mentions)

    def test_chunk_node_created_per_embedding(self):
        rows = [
            _embed_row("e1", "INC-1", "hydraulic leak"),
            _embed_row("e2", "INC-2", "bearing wear"),
        ]
        session, _ = self._run(rows)
        chunk_nodes = [r for r in session.node_rows if r["type"] == "chunk"]
        assert {r["id"] for r in chunk_nodes} == {"chunk:e1", "chunk:e2"}

    def test_empty_embeddings_returns_zero(self):
        session, result = self._run([])
        assert result == {"nodes": 0, "edges": 0}


class TestSimilarityEdges:
    def test_threshold_and_upper_triangle(self):
        from backend.app.graph.builder import _build_similarity_edges

        class _S(_BuilderFakeSession):
            def __init__(self):
                super().__init__([])

        session = _S()
        vecs = [
            [1.0, 0.0],
            [1.0, 0.0],   # identical to 0 → sim 1.0
            [0.0, 1.0],   # orthogonal → sim 0.0
        ]
        ids = ["chunk:a", "chunk:b", "chunk:c"]
        count = _build_similarity_edges(session, ids, vecs, threshold=0.8)
        assert count == 1
        edge = session.edge_rows[0]
        assert edge["from_node"] == "chunk:a"
        assert edge["to_node"] == "chunk:b"
        assert edge["weight"] == pytest.approx(1.0, abs=1e-5)
        # Full ids in edge id — no truncated suffixes
        assert edge["id"] == "sim:a:b"


# ---------------------------------------------------------------------------
# expander.py
# ---------------------------------------------------------------------------


class _ExpanderFakeSession:
    """Serves a tiny in-memory graph for expand_graph."""

    def __init__(self, edges: list[dict], nodes: list[dict]) -> None:
        self.edges = edges
        self.nodes = nodes
        self.query_count = 0

    def execute(self, sql: Any, params: Any = None) -> _FakeResult:
        self.query_count += 1
        stmt = str(sql)
        if "FROM graph_edge" in stmt:
            ids = set(params["node_ids"])
            types = set(params["edge_types"])
            rows = [
                _FakeRow(**e)
                for e in self.edges
                if e["type"] in types
                and (e["from_node"] in ids or e["to_node"] in ids)
            ]
            return _FakeResult(rows=rows)
        if "FROM graph_node" in stmt:
            ids = set(params["node_ids"])
            rows = [_FakeRow(properties=None, **n) for n in self.nodes if n["id"] in ids]
            return _FakeResult(rows=rows)
        return _FakeResult()


class TestExpandGraph:
    def _graph(self):
        edges = [
            {"id": "m1", "from_node": "chunk:a", "to_node": "entity:x",
             "type": "mentions", "weight": 1.0},
            {"id": "m2", "from_node": "chunk:b", "to_node": "entity:x",
             "type": "mentions", "weight": 1.0},
        ]
        nodes = [
            {"id": "chunk:a", "type": "chunk", "label": "A"},
            {"id": "chunk:b", "type": "chunk", "label": "B"},
            {"id": "entity:x", "type": "entity", "label": "X"},
        ]
        return edges, nodes

    def test_no_duplicate_edges_when_both_endpoints_seeded(self):
        from backend.app.graph.expander import expand_graph

        edges, nodes = self._graph()
        session = _ExpanderFakeSession(edges, nodes)
        # Both chunk:a and chunk:b seed → edge m1/m2 each returned once per
        # matching endpoint; dedup must collapse them.
        result = expand_graph(session, ["chunk:a", "chunk:b"], k=2)
        edge_ids = [e["id"] for e in result["edges"]]
        assert sorted(edge_ids) == ["m1", "m2"]
        assert len(edge_ids) == len(set(edge_ids))

    def test_k0_returns_seeds_only(self):
        from backend.app.graph.expander import expand_graph

        edges, nodes = self._graph()
        session = _ExpanderFakeSession(edges, nodes)
        result = expand_graph(session, ["chunk:a"], k=0)
        assert [n["id"] for n in result["nodes"]] == ["chunk:a"]
        assert result["edges"] == []

    def test_empty_seeds(self):
        from backend.app.graph.expander import expand_graph

        result = expand_graph(_ExpanderFakeSession([], []), [], k=2)
        assert result == {"nodes": [], "edges": []}

    def test_two_hop_reaches_sibling_chunk(self):
        from backend.app.graph.expander import expand_graph

        edges, nodes = self._graph()
        session = _ExpanderFakeSession(edges, nodes)
        result = expand_graph(session, ["chunk:a"], k=2)
        ids = {n["id"] for n in result["nodes"]}
        assert ids == {"chunk:a", "entity:x", "chunk:b"}


# ---------------------------------------------------------------------------
# scorer.py
# ---------------------------------------------------------------------------


class TestRankEvidence:
    def _fixture(self):
        vector_hits = [
            {"chunk_id": "a", "score": 0.9, "excerpt": "chunk A text",
             "incident_id": "INC-1", "metadata": {"event_date": "2024-06-01"}},
            {"chunk_id": "b", "score": 0.5, "excerpt": "chunk B text",
             "incident_id": "INC-2", "metadata": {"event_date": "2024-01-01"}},
        ]
        graph_nodes = [
            {"id": "chunk:a", "type": "chunk", "label": "A", "properties": {}},
            {"id": "chunk:b", "type": "chunk", "label": "B", "properties": {}},
            {"id": "entity:x", "type": "entity", "label": "hydraulic", "properties": {}},
            {"id": "entity:y", "type": "entity", "label": "bearing", "properties": {}},
        ]
        graph_edges = [
            {"id": "m1", "from_node": "chunk:a", "to_node": "entity:x",
             "type": "mentions", "weight": 1.0},
            {"id": "m2", "from_node": "chunk:b", "to_node": "entity:x",
             "type": "mentions", "weight": 1.0},
            {"id": "m3", "from_node": "chunk:a", "to_node": "entity:y",
             "type": "mentions", "weight": 1.0},
        ]
        return vector_hits, graph_nodes, graph_edges

    def test_conflict_flagged_for_multi_incident_entity(self):
        from backend.app.graph.scorer import rank_evidence

        hits, nodes, edges = self._fixture()
        ranked = rank_evidence(hits, nodes, edges, top_k=8)
        by_id = {r["node_id"]: r for r in ranked}
        # entity:x mentioned by chunks from INC-1 and INC-2 → conflict
        assert by_id["entity:x"]["conflict"] is True
        # entity:y mentioned by a single incident → no conflict
        assert by_id["entity:y"]["conflict"] is False

    def test_single_incident_entity_gets_incident_id(self):
        from backend.app.graph.scorer import rank_evidence

        hits, nodes, edges = self._fixture()
        ranked = rank_evidence(hits, nodes, edges, top_k=8)
        by_id = {r["node_id"]: r for r in ranked}
        assert by_id["entity:y"]["source_incident_id"] == "INC-1"

    def test_direct_hit_outranks_pure_graph_neighbour(self):
        from backend.app.graph.scorer import rank_evidence

        hits, nodes, edges = self._fixture()
        ranked = rank_evidence(hits, nodes, edges, top_k=8)
        order = [r["node_id"] for r in ranked]
        assert order.index("chunk:a") < order.index("entity:y")

    def test_top_k_ceiling(self):
        from backend.app.graph.scorer import rank_evidence

        hits, nodes, edges = self._fixture()
        ranked = rank_evidence(hits, nodes, edges, top_k=1)
        assert len(ranked) <= 2  # ceiling = top_k * 2

    def test_empty_graph(self):
        from backend.app.graph.scorer import rank_evidence

        assert rank_evidence([], [], [], top_k=8) == []


# ---------------------------------------------------------------------------
# orchestrator._truncate_graph_path
# ---------------------------------------------------------------------------


class TestTruncateGraphPath:
    def _make(self, n_nodes: int):
        nodes = [{"id": f"chunk:c{i}", "type": "chunk", "label": f"n{i}"}
                 for i in range(n_nodes)]
        edges = [
            {"id": f"e{i}", "from_node": f"chunk:c{i}",
             "to_node": f"chunk:c{i + 1}", "type": "similarity", "weight": 0.9}
            for i in range(n_nodes - 1)
        ]
        return nodes, edges

    def test_no_truncation_when_under_budget(self):
        from backend.app.agent.orchestrator import _truncate_graph_path

        nodes, edges = self._make(10)
        result = _truncate_graph_path(nodes, edges, vector_hits=[])
        assert result["nodes"] == nodes
        assert result["edges"] == edges

    def test_seed_chunks_survive_truncation(self):
        from backend.app.agent.orchestrator import _truncate_graph_path

        nodes, edges = self._make(100)
        # Seed is the LAST node — a blind [:40] slice would drop it
        hits = [{"chunk_id": "c99"}]
        result = _truncate_graph_path(nodes, edges, vector_hits=hits, max_nodes=40)
        kept = {n["id"] for n in result["nodes"]}
        assert "chunk:c99" in kept
        assert len(result["nodes"]) == 40

    def test_no_dangling_edges(self):
        from backend.app.agent.orchestrator import _truncate_graph_path

        nodes, edges = self._make(100)
        result = _truncate_graph_path(nodes, edges, vector_hits=[], max_nodes=40)
        kept = {n["id"] for n in result["nodes"]}
        for e in result["edges"]:
            assert e["from_node"] in kept
            assert e["to_node"] in kept

    def test_edge_budget_respected(self):
        from backend.app.agent.orchestrator import _truncate_graph_path

        nodes, edges = self._make(100)
        result = _truncate_graph_path(
            nodes, edges, vector_hits=[], max_nodes=50, max_edges=10
        )
        assert len(result["edges"]) <= 10
