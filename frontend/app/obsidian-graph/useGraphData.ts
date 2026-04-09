"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getLightRAGGraph,
  getPreloadedGraph,
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
  /** Domains currently being auto-indexed in the background */
  indexingDomains: Set<string>;
  refetch: () => void;
  buildIndex: (domain: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRIDGE_NODE_ID = "NEXTAGENTAI_BRIDGE";
const TOP_N_PER_DOMAIN = 5;
/** Poll interval (ms) while any domain is being auto-indexed */
const INDEX_POLL_MS = 5000;

// ---------------------------------------------------------------------------
// Graph merge helper — shared by fetchAll and polling upgrade
// ---------------------------------------------------------------------------

function mergeGraphs(
  aircraftGraph: { nodes: LightRAGGraphNode[]; edges: LightRAGGraphEdge[] } | null,
  medicalGraph:  { nodes: LightRAGGraphNode[]; edges: LightRAGGraphEdge[] } | null,
): { nodes: MergedNode[]; edges: MergedEdge[] } {
  const aircraftNodes: MergedNode[] = (aircraftGraph?.nodes ?? []).map(
    (n) => ({ ...n, domain: "aircraft" as NodeDomain, degree: 0 })
  );
  const medicalNodes: MergedNode[] = (medicalGraph?.nodes ?? []).map(
    (n) => ({ ...n, domain: "medical" as NodeDomain, degree: 0 })
  );

  const allDomainNodes: MergedNode[] = [...aircraftNodes, ...medicalNodes];
  const nodeDomainMap = new Map<string, NodeDomain>();
  for (const n of allDomainNodes) nodeDomainMap.set(n.id, n.domain);

  const aircraftEdges: MergedEdge[] = (aircraftGraph?.edges ?? []).map(
    (e) => ({ ...e, domain: (nodeDomainMap.get(e.source) ?? "aircraft") as NodeDomain })
  );
  const medicalEdges: MergedEdge[] = (medicalGraph?.edges ?? []).map(
    (e) => ({ ...e, domain: (nodeDomainMap.get(e.source) ?? "medical") as NodeDomain })
  );
  const allDomainEdges: MergedEdge[] = [...aircraftEdges, ...medicalEdges];

  // Compute degree
  const degreeMap = new Map<string, number>();
  for (const e of allDomainEdges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }
  for (const n of allDomainNodes) n.degree = degreeMap.get(n.id) ?? 0;

  if (allDomainNodes.length === 0) return { nodes: [], edges: [] };

  // Bridge node
  const topAircraft = [...aircraftNodes].sort((a, b) => b.degree - a.degree).slice(0, TOP_N_PER_DOMAIN);
  const topMedical  = [...medicalNodes ].sort((a, b) => b.degree - a.degree).slice(0, TOP_N_PER_DOMAIN);
  const bridgeTargets = [...topAircraft, ...topMedical];

  const bridgeEdges: MergedEdge[] = bridgeTargets.map((n, i) => ({
    id: `bridge_edge_${i}`,
    source: BRIDGE_NODE_ID,
    target: n.id,
    label: "connects",
    weight: 1,
    description: "",
    domain: n.domain,
  }));

  const bridgeNode: MergedNode = {
    id: BRIDGE_NODE_ID,
    label: "NEXTAGENTAI",
    type: "hub",
    domain: "bridge",
    degree: bridgeEdges.length,
    weight: 10,
    description: "Central hub connecting aircraft and medical knowledge domains",
  };

  return {
    nodes: [bridgeNode, ...allDomainNodes],
    edges: [...bridgeEdges, ...allDomainEdges],
  };
}

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
  const [indexingDomains, setIndexingDomains] = useState<Set<string>>(new Set());

  // Stable refs for polling — avoids stale closures in the interval callback
  const indexingDomainsRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which domains were served from preloaded PG data (need upgrade once LightRAG is done)
  const preloadedDomainsRef = useRef<Set<string>>(new Set());

  // ── fetchAll: load graph data, falling back to PG tables if LightRAG empty ──
  // Sequential loading strategy: aircraft renders first, medical loaded lazily
  // after so that a heavy medical preloaded graph never blocks the initial paint.

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Phase 1: Aircraft (renders immediately) ──────────────────────────
      const [lightragAircraft, aircraftStat] = await Promise.all([
        getLightRAGGraph("aircraft", 150).catch(() => null),
        getLightRAGStatus("aircraft").catch(() => null),
      ]);
      setAircraftStatus(aircraftStat);

      const aircraftEmpty = (lightragAircraft?.node_count ?? 0) === 0;
      const preloadedAircraft = aircraftEmpty
        ? await getPreloadedGraph("aircraft", 100).catch(() => null)
        : null;
      const aircraftGraph = aircraftEmpty ? preloadedAircraft : lightragAircraft;

      // Render aircraft-only graph immediately so the user sees something
      const { nodes: acNodes, edges: acEdges } = mergeGraphs(aircraftGraph, null);
      setNodes(acNodes);
      setEdges(acEdges);
      setLoading(false);

      // Track preloaded aircraft
      const newPreloaded = new Set<string>();
      if (aircraftEmpty && preloadedAircraft?.node_count) newPreloaded.add("aircraft");

      // ── Phase 2: Medical (lazy — does not block aircraft render) ─────────
      const [lightragMedical, medicalStat] = await Promise.all([
        getLightRAGGraph("medical", 100).catch(() => null),
        getLightRAGStatus("medical").catch(() => null),
      ]);
      setMedicalStatus(medicalStat);

      const medicalEmpty = (lightragMedical?.node_count ?? 0) === 0;
      const preloadedMedical = medicalEmpty
        ? await getPreloadedGraph("medical", 100).catch(() => null)
        : null;
      const medicalGraph = medicalEmpty ? preloadedMedical : lightragMedical;

      if (medicalEmpty && preloadedMedical?.node_count) newPreloaded.add("medical");
      preloadedDomainsRef.current = newPreloaded;

      // Full merge — aircraft + medical
      const { nodes: n, edges: e } = mergeGraphs(aircraftGraph, medicalGraph);
      setNodes(n);
      setEdges(e);

      // ── Auto-trigger LightRAG indexing for empty domains ──────────────────
      const toIndex: string[] = [];
      if (aircraftEmpty && aircraftStat?.index_job_status === "idle") toIndex.push("aircraft");
      if (medicalEmpty  && medicalStat?.index_job_status  === "idle") toIndex.push("medical");

      if (toIndex.length > 0) {
        // Trigger ONE domain at a time to avoid concurrent OOM on Render (512 MB).
        const [firstDomain] = toIndex;
        await triggerLightRAGIndex(firstDomain).catch(() => {});
        const newIndexing = new Set<string>([firstDomain]);
        indexingDomainsRef.current = newIndexing;
        setIndexingDomains(new Set(newIndexing));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph data");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Polling: watch for indexing completion, then upgrade graph ─────────────

  useEffect(() => {
    async function pollIndexStatus() {
      if (indexingDomainsRef.current.size === 0) return;

      try {
        // Check status for all currently-indexing domains in parallel
        const statuses = await Promise.all(
          [...indexingDomainsRef.current].map(async (domain) => ({
            domain,
            stat: await getLightRAGStatus(domain).catch(() => null),
          }))
        );

        const nowDone = statuses
          .filter(({ stat }) => stat?.index_job_status === "done" || stat?.indexed)
          .map(({ domain }) => domain);

        if (nowDone.length > 0) {
          // Remove completed domains from the indexing set
          const remaining = new Set(indexingDomainsRef.current);
          for (const d of nowDone) remaining.delete(d);
          indexingDomainsRef.current = remaining;
          setIndexingDomains(new Set(remaining));

          // Full refresh — replace preloaded PG data with LightRAG data now ready
          await fetchAll();
        }
      } catch {
        // polling errors are non-fatal
      }

      // Schedule next tick if still indexing
      if (indexingDomainsRef.current.size > 0) {
        pollTimerRef.current = setTimeout(pollIndexStatus, INDEX_POLL_MS);
      }
    }

    if (indexingDomains.size > 0) {
      pollTimerRef.current = setTimeout(pollIndexStatus, INDEX_POLL_MS);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [indexingDomains, fetchAll]);

  // ── Manual build index (called from empty-state buttons) ──────────────────

  const buildIndex = useCallback(async (domain: string) => {
    await triggerLightRAGIndex(domain);
    const newIndexing = new Set(indexingDomainsRef.current);
    newIndexing.add(domain);
    indexingDomainsRef.current = newIndexing;
    setIndexingDomains(new Set(newIndexing));
  }, []);

  // Derived empty flags
  const aircraftEmpty = !loading && nodes.filter((n) => n.domain === "aircraft").length === 0;
  const medicalEmpty  = !loading && nodes.filter((n) => n.domain === "medical" ).length === 0;

  return {
    nodes,
    edges,
    loading,
    error,
    aircraftStatus,
    medicalStatus,
    aircraftEmpty,
    medicalEmpty,
    indexingDomains,
    refetch: fetchAll,
    buildIndex,
  };
}
