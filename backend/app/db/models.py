"""
SQLAlchemy ORM models for NextAgentAI.
All seven tables from PRD Section 7.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    TEXT,
    VARCHAR,
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    __allow_unmapped__ = True


class IncidentReport(Base):
    """
    Synthetic incident narratives + any user-provided incident reports.
    Primary source of text for vector embedding and graph construction.
    """
    __tablename__ = "incident_reports"

    incident_id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    asset_id: str | None = Column(Text, nullable=True, index=True)
    system: str | None = Column(Text, nullable=True)
    sub_system: str | None = Column(Text, nullable=True)
    event_date: date | None = Column(Date, nullable=True, index=True)
    location: str | None = Column(Text, nullable=True)
    severity: str | None = Column(Text, nullable=True)
    narrative: str | None = Column(Text, nullable=True)
    corrective_action: str | None = Column(Text, nullable=True)
    source: str = Column(Text, nullable=False, default="synthetic")

    # Relationships
    embeddings: list["IncidentEmbedding"] = relationship(
        "IncidentEmbedding",
        back_populates="incident",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ManufacturingDefect(Base):
    """
    Structured defect records from Kaggle manufacturing defects datasets.
    Used for SQL aggregation queries and graph co-occurrence edges.
    """
    __tablename__ = "manufacturing_defects"

    defect_id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    product: str | None = Column(Text, nullable=True, index=True)
    defect_type: str | None = Column(Text, nullable=True)
    severity: str | None = Column(Text, nullable=True)
    inspection_date: date | None = Column(Date, nullable=True)
    plant: str | None = Column(Text, nullable=True)
    lot_number: str | None = Column(Text, nullable=True)
    action_taken: str | None = Column(Text, nullable=True)
    source: str = Column(Text, nullable=False, default="kaggle")


class MaintenanceLog(Base):
    """
    Time-series sensor readings and maintenance events from Kaggle aircraft dataset.
    Used for SQL trend queries and graph edge construction.
    """
    __tablename__ = "maintenance_logs"

    log_id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    asset_id: str | None = Column(Text, nullable=True)
    ts: datetime | None = Column(DateTime, nullable=True)
    metric_name: str | None = Column(Text, nullable=True)
    metric_value: float | None = Column(Float, nullable=True)
    unit: str | None = Column(Text, nullable=True)
    source: str = Column(Text, nullable=False, default="kaggle")


class IncidentEmbedding(Base):
    """
    Chunk-level embeddings for incident report narratives.
    384-dimensional vectors from all-MiniLM-L6-v2.
    Searched via IVFFlat cosine index.
    """
    __tablename__ = "incident_embeddings"

    embed_id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: str = Column(
        Text,
        ForeignKey("incident_reports.incident_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: int = Column(Integer, nullable=False)
    chunk_text: str = Column(Text, nullable=False)
    embedding: list[float] = Column(Vector(384), nullable=True)
    char_start: int = Column(Integer, nullable=True)
    char_end: int = Column(Integer, nullable=True)
    created_at: datetime = Column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    incident: "IncidentReport" = relationship(
        "IncidentReport",
        back_populates="embeddings",
        lazy="selectin",
    )


class GraphNode(Base):
    """
    Knowledge graph nodes: either entity nodes (asset, system, defect type, etc.)
    or chunk nodes (linked to a specific incident embedding chunk).
    """
    __tablename__ = "graph_node"

    id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    type: str = Column(Text, nullable=False)           # 'entity' | 'chunk'
    label: str | None = Column(Text, nullable=True)
    properties: dict[str, Any] = Column(JSONB, nullable=True)

    # Edges where this node is the source
    outgoing_edges: list["GraphEdge"] = relationship(
        "GraphEdge",
        foreign_keys="GraphEdge.from_node",
        back_populates="source_node",
        cascade="all, delete-orphan",
        lazy="select",
    )
    # Edges where this node is the target
    incoming_edges: list["GraphEdge"] = relationship(
        "GraphEdge",
        foreign_keys="GraphEdge.to_node",
        back_populates="target_node",
        cascade="all, delete-orphan",
        lazy="select",
    )


class GraphEdge(Base):
    """
    Knowledge graph edges between nodes.
    Types: 'mentions' (chunk→entity), 'co_occurrence' (entity↔entity),
           'similarity' (chunk↔chunk, cosine > threshold).
    """
    __tablename__ = "graph_edge"

    id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    from_node: str = Column(
        Text,
        ForeignKey("graph_node.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_node: str = Column(
        Text,
        ForeignKey("graph_node.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: str = Column(Text, nullable=False)     # 'mentions' | 'similarity' | 'co_occurrence'
    weight: float = Column(Float, nullable=True)
    properties: dict[str, Any] = Column(JSONB, nullable=True)

    source_node: "GraphNode" = relationship(
        "GraphNode",
        foreign_keys=[from_node],
        back_populates="outgoing_edges",
        lazy="select",
    )
    target_node: "GraphNode" = relationship(
        "GraphNode",
        foreign_keys=[to_node],
        back_populates="incoming_edges",
        lazy="select",
    )


class AgentRun(Base):
    """
    Persistent record of every agent invocation.
    Stores full JSON output for /runs/{run_id} retrieval.
    """
    __tablename__ = "agent_runs"

    run_id: str = Column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    query: str | None = Column(Text, nullable=True)
    result: dict[str, Any] = Column(JSONB, nullable=True)   # Full AgentRunResult schema
    created_at: datetime = Column(DateTime, nullable=False, server_default=func.now())
