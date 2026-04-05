"use client";

import { useState, useCallback } from "react";
import {
  getLightRAGGraph,
  getLightRAGStatus,
  triggerLightRAGIndex,
  type LightRAGGraphNode,
  type LightRAGGraphEdge,
  type LightRAGStatus,
} from "../lib/api";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type NodeDomain = "aircraft" | "medical" | "bridge";

export interface MergedNode extends LightRAGGraphNode {
  domain: NodeDomain;
  degree: number;
}

export interface MergedEdge extends LightRAGGraphEdge {
  domain: NodeDomain;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface GraphData {
  nodes: MergedNode[];
  edges: MergedEdge[];
  loading: boolean;
  error: string | null;
  aircraftStatus: LightRAGStatus | null;
  medicalStatus: LightRAGStatus | null;
  aircraftEmpty: boolean;
  medicalEmpty: boolean;
  refetch: () => void;
  buildIndex: (domain: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRIDGE_NODE_ID = "NEXTAGENTAI_BRIDGE";
const TOP_N_PER_DOMAIN = 5;

// ---------------------------------------------------------------------------
// useGraphData
// ---------------------------------------------------------------------------

export function useGraphData(): GraphData {
  const [nodes, setNodes] = useState<MergedNode[]>([]);
  const [edges, setEdges] = useState<MergedEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aircraftStatus, setAircraftStatus] = useState<LightRAGStatus | null>(null);
  const [medicalStatus, setMedicalStatus] = useState<LightRAGStatus | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [aircraftGraph, medicalGraph, aircraftStat, medicalStat] =
        await Promise.all([
          getLightRAGGraph("aircraft", 300).catch(() => null),
          getLightRAGGraph("medical", 300).catch(() => null),
          getLightRAGStatus("aircraft").catch(() => null),
          getLightRAGStatus("medical").catch(() => null),
        ]);

      // Store statuses
      setAircraftStatus(aircraftStat);
      setMedicalStatus(medicalStat);

      // Tag nodes with their domain
      const aircraftNodes: MergedNode[] = (aircraftGraph?.nodes ?? []).map(
        (n) => ({ ...n, domain: "aircraft" as NodeDomain, degree: 0 })
      );
      const medicalNodes: MergedNode[] = (medicalGraph?.nodes ?? []).map(
        (n) => ({ ...n, domain: "medical" as NodeDomain, degree: 0 })
      );

      const allDomainNodes: MergedNode[] = [...aircraftNodes, ...medicalNodes];

      // Build a lookup map: nodeId -> domain (for edge tagging)
      const nodeDomainMap = new Map<string, NodeDomain>();
      for (const n of allDomainNodes) {
        nodeDomainMap.set(n.id, n.domain);
      }

      // Tag edges with the domain of their source node
      const aircraftEdges: MergedEdge[] = (aircraftGraph?.edges ?? []).map(
        (e) => ({
          ...e,
          domain: (nodeDomainMap.get(e.source) ?? "aircraft") as NodeDomain,
        })
      );
      const medicalEdges: MergedEdge[] = (medicalGraph?.edges ?? []).map(
        (e) => ({
          ...e,
          domain: (nodeDomainMap.get(e.source) ?? "medical") as NodeDomain,
        })
      );

      const allDomainEdges: MergedEdge[] = [...aircraftEdges, ...medicalEdges];

      // Compute degree for each node (count edge endpoints touching it)
      const degreeMap = new Map<string, number>();
      for (const e of allDomainEdges) {
        degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
        degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
      }
      for (const n of allDomainNodes) {
        n.degree = degreeMap.get(n.id) ?? 0;
      }

      // Only inject the bridge node when there are domain nodes to connect to
      if (allDomainNodes.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      // Pick top-N highest-degree nodes per domain for bridge connections
      const topAircraft = [...aircraftNodes]
        .sort((a, b) => b.degree - a.degree)
        .slice(0, TOP_N_PER_DOMAIN);

      const topMedical = [...medicalNodes]
        .sort((a, b) => b.degree - a.degree)
        .slice(0, TOP_N_PER_DOMAIN);

      const bridgeTargets = [...topAircraft, ...topMedical];

      // Build synthetic bridge edges
      const bridgeEdges: MergedEdge[] = bridgeTargets.map((n, i) => ({
        id: `bridge_edge_${i}`,
        source: BRIDGE_NODE_ID,
        target: n.id,
        label: "connects",
        weight: 1,
        description: "",
        domain: n.domain,
      }));

      // Build bridge node with degree = number of bridge edges created
      const bridgeNode: MergedNode = {
        id: BRIDGE_NODE_ID,
        label: "NEXTAGENTAI",
        type: "hub",
        domain: "bridge",
        degree: bridgeEdges.length,
        weight: 10,
        description:
          "Central hub connecting aircraft and medical knowledge domains",
      };

      setNodes([bridgeNode, ...allDomainNodes]);
      setEdges([...bridgeEdges, ...allDomainEdges]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger on first render via lazy initialisation pattern — caller must
  // invoke refetch() explicitly (e.g. in a useEffect) to start the fetch.
  // This keeps the hook side-effect-free by default.

  const buildIndex = useCallback(async (domain: string) => {
    await triggerLightRAGIndex(domain);
  }, []);

  // Derived empty flags: true when not loading AND the domain has zero nodes
  const aircraftEmpty =
    !loading && nodes.filter((n) => n.domain === "aircraft").length === 0;
  const medicalEmpty =
    !loading && nodes.filter((n) => n.domain === "medical").length === 0;

  return {
    nodes,
    edges,
    loading,
    error,
    aircraftStatus,
    medicalStatus,
    aircraftEmpty,
    medicalEmpty,
    refetch: fetchAll,
    buildIndex,
  };
}
