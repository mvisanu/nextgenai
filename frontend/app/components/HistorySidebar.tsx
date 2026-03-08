"use client";

// ============================================================
// HistorySidebar.tsx — Collapsible query history sidebar
// Epic 2 — Query History & Favourites
// 240px wide, toggled by clock icon in ChatPanel header
// ============================================================

import React, { useEffect, useState, useCallback } from "react";
import { Star, Share2, Clock, X, Loader2, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRuns, patchFavourite, getRun } from "../lib/api";
import type { HistoryRunSummary, QueryResponse } from "../lib/api";
import { useRunContext } from "../lib/context";

// ---------------------------------------------------------------------------
// Relative timestamp formatter
// ---------------------------------------------------------------------------

function formatRelative(isoString: string | null): string {
  if (!isoString) return "unknown";
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Intent badge colour mapping
// ---------------------------------------------------------------------------

const INTENT_COLORS: Record<string, string> = {
  vector_only: "--col-cyan",
  semantic:    "--col-cyan",
  sql_only:    "--col-green",
  aggregation: "--col-green",
  hybrid:      "--col-purple",
  compute:     "--col-amber",
  unknown:     "--col-blue",
};

function intentColor(intent: string): string {
  return INTENT_COLORS[intent] ?? "--col-blue";
}

function intentLabel(intent: string): string {
  return intent.replace("_", " ").toUpperCase().slice(0, 8);
}

// ---------------------------------------------------------------------------
// Single run item
// ---------------------------------------------------------------------------

interface RunItemProps {
  run: HistoryRunSummary;
  onLoad: (run: HistoryRunSummary) => void;
  onToggleFavourite: (run: HistoryRunSummary) => void;
  onShare: (run: HistoryRunSummary) => void;
  loadingId: string | null;
}

function RunItem({ run, onLoad, onToggleFavourite, onShare, loadingId }: RunItemProps) {
  const col = intentColor(run.intent);
  const isLoading = loadingId === run.id;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid hsl(var(--border-base) / 0.5)",
        backgroundColor: "transparent",
        cursor: "pointer",
        transition: "background-color 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = "hsl(var(--bg-elevated))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
      }}
    >
      {/* Query text — click to load */}
      <div
        onClick={() => onLoad(run)}
        style={{ marginBottom: "5px", display: "flex", alignItems: "flex-start", gap: "5px" }}
      >
        {isLoading ? (
          <Loader2 size={10} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0, marginTop: "2px", animation: "spin 1s linear infinite" }} />
        ) : (
          <Clock size={10} style={{ color: "hsl(var(--text-dim))", flexShrink: 0, marginTop: "2px" }} />
        )}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "hsl(var(--text-secondary))",
            lineHeight: "1.4",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            flex: 1,
          }}
          title={run.query}
        >
          {run.query.slice(0, 60)}{run.query.length > 60 ? "…" : ""}
        </span>
      </div>

      {/* Meta row: intent badge + timestamp + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", paddingLeft: "15px" }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.42rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          padding: "1px 4px",
          borderRadius: "2px",
          border: `1px solid hsl(var(${col}) / 0.5)`,
          color: `hsl(var(${col}))`,
          backgroundColor: `hsl(var(${col}) / 0.08)`,
          flexShrink: 0,
        }}>
          {intentLabel(run.intent)}
        </span>

        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.62rem",
          color: "hsl(var(--text-dim))",
          flex: 1,
        }}>
          {formatRelative(run.created_at)}
        </span>

        {/* Star button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavourite(run); }}
          aria-label={run.is_favourite ? "Remove from favourites" : "Add to favourites"}
          title={run.is_favourite ? "Remove from favourites" : "Add to favourites"}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: run.is_favourite ? "hsl(var(--col-amber))" : "hsl(var(--text-dim))",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-amber))"; }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = run.is_favourite
              ? "hsl(var(--col-amber))"
              : "hsl(var(--text-dim))";
          }}
        >
          <Star size={10} fill={run.is_favourite ? "currentColor" : "none"} />
        </button>

        {/* Share button */}
        <button
          onClick={(e) => { e.stopPropagation(); onShare(run); }}
          aria-label="Copy share link"
          title="Copy share link"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: "hsl(var(--text-dim))",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-cyan))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))"; }}
        >
          <Share2 size={10} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistorySidebar
// ---------------------------------------------------------------------------

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function HistorySidebar({ open, onClose }: HistorySidebarProps) {
  const { setRunData } = useRunContext();
  const [runs, setRuns] = useState<HistoryRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await getRuns(20, 0);
      // Sort: favourites first, then reverse chronological
      const sorted = [...resp.items].sort((a, b) => {
        if (a.is_favourite !== b.is_favourite) return a.is_favourite ? -1 : 1;
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      setRuns(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    if (open) {
      void fetchRuns();
    }
  }, [open, fetchRuns]);

  const handleLoad = useCallback(async (run: HistoryRunSummary) => {
    setLoadingId(run.id);
    try {
      const fullRun = await getRun(run.id);
      setRunData(fullRun as QueryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run.");
    } finally {
      setLoadingId(null);
    }
  }, [setRunData]);

  const handleToggleFavourite = useCallback(async (run: HistoryRunSummary) => {
    // Optimistic update
    setRuns((prev) =>
      prev.map((r) => r.id === run.id ? { ...r, is_favourite: !r.is_favourite } : r)
    );
    try {
      const updated = await patchFavourite(run.id, !run.is_favourite);
      setRuns((prev) => {
        const next = prev.map((r) => r.id === run.id ? updated : r);
        return [...next].sort((a, b) => {
          if (a.is_favourite !== b.is_favourite) return a.is_favourite ? -1 : 1;
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
      });
    } catch {
      // Revert on error
      setRuns((prev) =>
        prev.map((r) => r.id === run.id ? { ...r, is_favourite: run.is_favourite } : r)
      );
    }
  }, []);

  const handleShare = useCallback((run: HistoryRunSummary) => {
    const url = `${window.location.origin}/?run=${encodeURIComponent(run.id)}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(run.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  if (!open) return null;

  const favourites = runs.filter((r) => r.is_favourite);
  const recent = runs.filter((r) => !r.is_favourite);

  return (
    <div
      style={{
        width: "240px",
        flexShrink: 0,
        height: "100%",
        backgroundColor: "hsl(var(--bg-surface))",
        borderRight: "1px solid hsl(var(--border-base))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid hsl(var(--border-base))",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Clock size={11} style={{ color: "hsl(var(--col-cyan))" }} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.55rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "hsl(var(--col-cyan))",
            }}
          >
            HISTORY
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close history sidebar"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "hsl(var(--text-dim))",
            padding: "2px",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-red))"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))"; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Copied notification */}
      {copiedId && (
        <div style={{
          padding: "5px 10px",
          backgroundColor: "hsl(var(--col-cyan) / 0.1)",
          borderBottom: "1px solid hsl(var(--col-cyan) / 0.3)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.62rem",
          color: "hsl(var(--col-cyan))",
          flexShrink: 0,
        }}>
          Link copied to clipboard
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "12px 10px" }}>
          <Loader2 size={12} style={{ color: "hsl(var(--col-cyan))", animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--text-dim))" }}>
            Loading…
          </span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", padding: "10px" }}>
          <AlertTriangle size={11} style={{ color: "hsl(var(--col-red))", flexShrink: 0, marginTop: "1px" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--col-red))", lineHeight: "1.4" }}>
            {error}
          </span>
        </div>
      )}

      {/* Run list */}
      {!isLoading && !error && (
        <ScrollArea style={{ flex: 1 }}>
          {runs.length === 0 ? (
            <div style={{ padding: "16px 10px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--text-dim))" }}>
                No history yet.
                <br />
                <span style={{ fontSize: "0.6rem", opacity: 0.7 }}>Submit a query to begin.</span>
              </p>
            </div>
          ) : (
            <>
              {/* Favourites section */}
              {favourites.length > 0 && (
                <>
                  <div style={{ padding: "5px 10px 3px", borderBottom: "1px solid hsl(var(--border-base) / 0.5)" }}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.42rem",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "hsl(var(--col-amber))",
                    }}>
                      FAVOURITES
                    </span>
                  </div>
                  {favourites.map((run) => (
                    <RunItem
                      key={run.id}
                      run={run}
                      onLoad={handleLoad}
                      onToggleFavourite={handleToggleFavourite}
                      onShare={handleShare}
                      loadingId={loadingId}
                    />
                  ))}
                </>
              )}

              {/* Recent section */}
              {recent.length > 0 && (
                <>
                  <div style={{ padding: "5px 10px 3px", borderBottom: "1px solid hsl(var(--border-base) / 0.5)" }}>
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.42rem",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "hsl(var(--text-dim))",
                    }}>
                      RECENT
                    </span>
                  </div>
                  {recent.map((run) => (
                    <RunItem
                      key={run.id}
                      run={run}
                      onLoad={handleLoad}
                      onToggleFavourite={handleToggleFavourite}
                      onShare={handleShare}
                      loadingId={loadingId}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
