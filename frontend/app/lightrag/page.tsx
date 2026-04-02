"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  getLightRAGStatus,
  getLightRAGGraph,
  triggerLightRAGIndex,
  queryLightRAG,
  type LightRAGStatus,
  type LightRAGGraphData,
  type LightRAGGraphNode,
} from "../lib/api";

// Import LightRAGGraphViewer with SSR disabled (React Flow requires browser APIs)
const LightRAGGraphViewer = dynamic(
  () => import("../components/LightRAGGraphViewer"),
  { ssr: false }
);

const QUERY_MODES = [
  { value: "hybrid", label: "Hybrid (recommended)" },
  { value: "local",  label: "Local — entity-focused" },
  { value: "global", label: "Global — relationship-focused" },
  { value: "naive",  label: "Naive — basic vector search" },
  { value: "mix",    label: "Mix — KG + vector" },
];

export default function LightRAGPage() {
  const [domain, setDomain] = useState<"aircraft" | "medical">("aircraft");
  const [status, setStatus] = useState<LightRAGStatus | null>(null);
  const [graphData, setGraphData] = useState<LightRAGGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<LightRAGGraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [maxNodes, setMaxNodes] = useState(200);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Count connections for selected node
  const connectionCount = selectedNode && graphData
    ? graphData.edges.filter(
        (e) => e.source === selectedNode.id || e.target === selectedNode.id
      ).length
    : 0;

  const loadStatus = useCallback(async () => {
    try {
      const s = await getLightRAGStatus(domain);
      setStatus(s);
      return s;
    } catch (err) {
      console.error("Status load failed:", err);
      return null;
    }
  }, [domain]);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await getLightRAGGraph(domain, maxNodes);
      setGraphData(g);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [domain, maxNodes]);

  // Load status + graph on domain change
  useEffect(() => {
    setSelectedNode(null);
    setQueryResult(null);
    loadStatus();
    loadGraph();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIndex = async () => {
    setError(null);
    setIndexing(true);
    try {
      await triggerLightRAGIndex(domain);
    } catch (err) {
      setError(String(err));
      setIndexing(false);
      return;
    }

    // Poll every 3 seconds until done or error
    pollRef.current = setInterval(async () => {
      const s = await loadStatus();
      if (!s) return;
      if (s.index_job_status === "done") {
        if (pollRef.current) clearInterval(pollRef.current);
        setIndexing(false);
        await loadGraph();
      } else if (s.index_job_status === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setIndexing(false);
        setError("Indexing failed. Check backend logs.");
      }
    }, 3000);
  };

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQueryLoading(true);
    setError(null);
    try {
      const result = await queryLightRAG({ domain, query: query.trim(), mode });
      setQueryResult(result.answer);
    } catch (err) {
      setError(String(err));
    } finally {
      setQueryLoading(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: { id: string; data: LightRAGGraphNode }) => {
      setSelectedNode(node.data);
    },
    []
  );

  return (
    <div
      style={{ height: "calc(100vh - 46px)", width: "100%" }}
      className="flex flex-col bg-[#0a0e17]"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cyan-900/30 flex-shrink-0">
        <h1 className="font-[Orbitron] text-cyan-400 tracking-widest text-sm uppercase">
          LIGHTRAG // KNOWLEDGE GRAPH EXPLORER
        </h1>
        <div className="flex gap-2">
          {(["aircraft", "medical"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`font-[Orbitron] text-xs px-3 py-1 tracking-wider uppercase border transition-all
                ${
                  domain === d
                    ? "bg-cyan-900/40 border-cyan-400 text-cyan-300"
                    : "border-cyan-900/30 text-cyan-700 hover:border-cyan-600 hover:text-cyan-500"
                }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left control panel */}
        <div className="w-[300px] flex-shrink-0 flex flex-col gap-3 p-3 border-r border-cyan-900/30 overflow-y-auto">

          {/* Status card */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  status?.indexed ? "bg-green-400" : "bg-amber-400"
                }`}
              />
              <span className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase">
                INDEX STATUS
              </span>
            </div>
            {status ? (
              <div className="font-[JetBrains_Mono] text-xs text-cyan-600 space-y-1">
                <div>{status.entity_count} ENTITIES</div>
                <div>{status.relation_count} RELATIONS</div>
                <div>{status.doc_count} DOCUMENTS</div>
                <div className="text-cyan-800 uppercase">{status.index_job_status}</div>
              </div>
            ) : (
              <div className="font-[JetBrains_Mono] text-xs text-cyan-800">Loading...</div>
            )}
            <button
              onClick={handleIndex}
              disabled={indexing}
              className="mt-2 w-full font-[Orbitron] text-xs px-3 py-1.5 tracking-wider uppercase border border-cyan-700 text-cyan-400 hover:bg-cyan-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {indexing ? "INDEXING... (1-3 min)" : "INDEX DATA"}
            </button>
            {indexing && (
              <div className="mt-1 flex items-center gap-2">
                <div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="font-[JetBrains_Mono] text-xs text-cyan-700">Processing...</span>
              </div>
            )}
          </div>

          {/* Max nodes slider */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded">
            <label className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase block mb-2">
              MAX NODES: {maxNodes}
            </label>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={maxNodes}
              onChange={(e) => setMaxNodes(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <button
              onClick={loadGraph}
              disabled={loading}
              className="mt-2 w-full font-[Orbitron] text-xs px-3 py-1 tracking-wider uppercase border border-cyan-900/50 text-cyan-600 hover:border-cyan-700 hover:text-cyan-500 disabled:opacity-40 transition-all"
            >
              {loading ? "LOADING..." : "RELOAD GRAPH"}
            </button>
          </div>

          {/* Query section */}
          <div className="border border-cyan-900/30 bg-[#0f1623] p-3 rounded flex flex-col gap-2">
            <label className="font-[Orbitron] text-xs text-cyan-400 tracking-wider uppercase">
              QUERY GRAPH
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query the knowledge graph..."
              rows={3}
              className="w-full bg-[#0a0e17] border border-cyan-900/40 text-cyan-300 font-[Rajdhani] text-sm p-2 rounded resize-none focus:outline-none focus:border-cyan-600 placeholder:text-cyan-900"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-[#0a0e17] border border-cyan-900/40 text-cyan-400 font-[JetBrains_Mono] text-xs p-1.5 rounded focus:outline-none focus:border-cyan-600"
            >
              {QUERY_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleQuery}
              disabled={queryLoading || !query.trim()}
              className="w-full font-[Orbitron] text-xs px-3 py-1.5 tracking-wider uppercase bg-cyan-900/30 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {queryLoading ? "QUERYING..." : "SUBMIT QUERY"}
            </button>
            {queryResult && (
              <div className="border border-cyan-900/30 bg-[#0a0e17] p-2 rounded max-h-40 overflow-y-auto">
                <p className="font-[Rajdhani] text-xs text-cyan-400 whitespace-pre-wrap">
                  {queryResult}
                </p>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="border border-red-900/50 bg-red-950/20 p-2 rounded">
              <p className="font-[JetBrains_Mono] text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Right panel: graph + node detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Graph stats bar */}
          <div className="flex gap-4 px-3 py-1 border-b border-cyan-900/20 font-[JetBrains_Mono] text-xs text-cyan-700 flex-shrink-0">
            <span>{graphData?.node_count ?? 0} ENTITIES</span>
            <span>|</span>
            <span>{graphData?.edge_count ?? 0} RELATIONS</span>
            <span>|</span>
            <span>{domain.toUpperCase()} DOMAIN</span>
            <span>|</span>
            <span>LIGHTRAG v1.3+</span>
          </div>

          {/* React Flow graph */}
          <div className="flex-1 overflow-hidden">
            <LightRAGGraphViewer
              nodes={graphData?.nodes ?? []}
              edges={graphData?.edges ?? []}
              onNodeClick={handleNodeClick}
              loading={loading}
              domain={domain}
            />
          </div>

          {/* Node detail panel */}
          {selectedNode && (
            <div className="border-t border-cyan-900/30 bg-[#0f1623] p-3 font-[JetBrains_Mono] text-xs flex-shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-cyan-400 font-bold uppercase">
                    {selectedNode.label}
                  </span>
                  <span className="ml-2 text-cyan-700">
                    TYPE: {selectedNode.type.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-cyan-800 hover:text-cyan-400"
                >
                  ✕
                </button>
              </div>
              <p className="text-cyan-600 mt-1 line-clamp-2">
                {selectedNode.description || "No description."}
              </p>
              <div className="flex gap-4 mt-1 text-cyan-800">
                <span>CONNECTIONS: {connectionCount}</span>
                <span>WEIGHT: {selectedNode.weight.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
