"use client";

// ============================================================
// CitationsDrawer.tsx — Industrial data-sheet side panel
// Source chunk display with confidence meter, highlighted
// excerpt, and key-value metadata rows
// ============================================================

import React, { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, X, FileText, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import { getChunk } from "../lib/api";
import type { Claim, ChunkResponse } from "../lib/api";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CitationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCitation: Claim | null;
  citationIndex: number;
}

// ---------------------------------------------------------------------------
// Confidence meter bar
// ---------------------------------------------------------------------------

function ConfidenceMeter({ confidence }: { confidence: number }) {
  let color: string;
  let label: string;

  if (confidence >= 0.7)      { color = "var(--col-green)"; label = "HIGH"; }
  else if (confidence >= 0.4) { color = "var(--col-amber)"; label = "MED";  }
  else                        { color = "var(--col-red)";   label = "LOW";  }

  const pct = (confidence * 100).toFixed(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: `hsl(${color})`,
          }}
        >
          CONFIDENCE: {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.78rem",
            color: `hsl(${color})`,
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Bar track */}
      <div
        style={{
          height: 3,
          backgroundColor: "hsl(var(--border-base))",
          borderRadius: "1px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: `hsl(${color})`,
            boxShadow: `0 0 8px hsl(${color} / 0.5)`,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlighted chunk text
// ---------------------------------------------------------------------------

function HighlightedChunkText({
  chunkText,
  charStart,
  charEnd,
}: {
  chunkText: string;
  charStart: number;
  charEnd: number;
}) {
  const before      = chunkText.slice(0, charStart);
  const highlighted = chunkText.slice(charStart, charEnd);
  const after       = chunkText.slice(charEnd);

  return (
    <p
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "0.9rem",
        lineHeight: "1.7",
        whiteSpace: "pre-wrap",
        color: "hsl(var(--text-secondary))",
      }}
    >
      {before}
      <mark className="citation-highlight">{highlighted}</mark>
      {after}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Metadata key-value row
// ---------------------------------------------------------------------------

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: "hsl(var(--text-dim))",
          flexShrink: 0,
          minWidth: "60px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.88rem",
          color: "hsl(var(--text-data))",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CitationsDrawer
// ---------------------------------------------------------------------------

export default function CitationsDrawer({
  open,
  onOpenChange,
  activeCitation,
  citationIndex,
}: CitationsDrawerProps) {
  const [chunkData, setChunkData] = useState<ChunkResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Index into activeCitation.citations[] for Prev/Next navigation
  const [citationNavIndex, setCitationNavIndex] = useState(0);

  // Reset nav index when a new citation is opened
  useEffect(() => {
    setCitationNavIndex(0);
  }, [activeCitation, open]);

  const totalCitations = activeCitation?.citations.length ?? 0;
  const currentCitation = activeCitation?.citations[citationNavIndex];

  useEffect(() => {
    if (!open || !activeCitation || activeCitation.citations.length === 0) return;

    const citation = currentCitation;
    if (!citation) return;
    const { incident_id, chunk_id } = citation;
    let cancelled = false;

    async function fetchChunk() {
      setIsFetching(true);
      setFetchError(null);
      setChunkData(null);

      try {
        const data = await getChunk(incident_id, chunk_id);
        if (!cancelled) setChunkData(data);
      } catch (err) {
        if (!cancelled)
          setFetchError(
            err instanceof Error ? err.message : "Failed to load source chunk."
          );
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }

    void fetchChunk();
    return () => { cancelled = true; };
  }, [open, activeCitation, citationNavIndex, currentCitation]);

  useEffect(() => {
    if (!open) {
      setChunkData(null);
      setFetchError(null);
      setIsFetching(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{
          width: "480px",
          maxWidth: "92vw",
          backgroundColor: "hsl(var(--bg-panel))",
          borderLeft: "1px solid hsl(var(--border-base))",
          borderTop: "2px solid hsl(var(--col-cyan))",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "1px solid hsl(var(--border-base))",
            backgroundColor: "hsl(var(--bg-surface))",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <BookOpen size={13} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
              <SheetTitle
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "hsl(var(--text-secondary))",
                  margin: 0,
                }}
              >
                SOURCE DOCUMENT // REF [{citationIndex + 1}]
              </SheetTitle>
            </div>

            {/* Prev/Next navigation when multiple citations */}
            {totalCitations > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={() => setCitationNavIndex((i) => Math.max(0, i - 1))}
                  disabled={citationNavIndex === 0}
                  aria-label="Previous citation"
                  style={{
                    background: "transparent",
                    border: "1px solid hsl(var(--border-base))",
                    borderRadius: "2px",
                    cursor: citationNavIndex === 0 ? "not-allowed" : "pointer",
                    color: citationNavIndex === 0 ? "hsl(var(--text-dim))" : "hsl(var(--col-cyan))",
                    padding: "3px 5px",
                    display: "flex", alignItems: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <ChevronLeft size={11} />
                </button>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.68rem",
                  color: "hsl(var(--text-secondary))",
                }}>
                  {citationNavIndex + 1} of {totalCitations}
                </span>
                <button
                  onClick={() => setCitationNavIndex((i) => Math.min(totalCitations - 1, i + 1))}
                  disabled={citationNavIndex === totalCitations - 1}
                  aria-label="Next citation"
                  style={{
                    background: "transparent",
                    border: "1px solid hsl(var(--border-base))",
                    borderRadius: "2px",
                    cursor: citationNavIndex === totalCitations - 1 ? "not-allowed" : "pointer",
                    color: citationNavIndex === totalCitations - 1 ? "hsl(var(--text-dim))" : "hsl(var(--col-cyan))",
                    padding: "3px 5px",
                    display: "flex", alignItems: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <ChevronRight size={11} />
                </button>
              </div>
            )}

            {activeCitation && (
              <>
                {/* Claim text */}
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.92rem",
                    color: "hsl(var(--text-primary))",
                    lineHeight: "1.5",
                    borderLeft: "2px solid hsl(var(--col-cyan))",
                    paddingLeft: "8px",
                  }}
                >
                  {activeCitation.text}
                </p>

                {/* Confidence meter + conflict badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <ConfidenceMeter confidence={activeCitation.confidence} />
                  </div>
                  {activeCitation.conflict_flagged && (
                    <span style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.52rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      padding: "2px 6px",
                      borderRadius: "2px",
                      border: "1px solid hsl(var(--col-amber) / 0.5)",
                      color: "hsl(var(--col-amber))",
                      backgroundColor: "hsl(var(--col-amber) / 0.08)",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}>
                      CONFLICT
                    </span>
                  )}
                </div>

                {/* Conflict note */}
                {activeCitation.conflict_note && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "7px",
                      padding: "7px 9px",
                      border: "1px solid hsl(var(--col-amber) / 0.4)",
                      borderLeft: "2px solid hsl(var(--col-amber))",
                      backgroundColor: "hsl(var(--col-amber) / 0.06)",
                      borderRadius: "2px",
                    }}
                  >
                    <AlertTriangle
                      size={11}
                      style={{ color: "hsl(var(--col-amber))", flexShrink: 0, marginTop: "1px" }}
                    />
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        color: "hsl(var(--col-amber))",
                        lineHeight: "1.4",
                      }}
                    >
                      {activeCitation.conflict_note}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close citation drawer"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid hsl(var(--border-base))",
              borderRadius: "2px",
              backgroundColor: "transparent",
              color: "hsl(var(--text-secondary))",
              cursor: "pointer",
              flexShrink: 0,
              marginLeft: "8px",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-red) / 0.5)";
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-red))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-secondary))";
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* ── Body: chunk content ── */}
        <ScrollArea style={{ flex: 1 }}>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Loading skeletons */}
            {isFetching && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[1, 0.85, 0.9, 0.75, 0.8].map((w, i) => (
                  <Skeleton
                    key={i}
                    style={{
                      height: "10px",
                      width: `${w * 100}%`,
                      backgroundColor: "hsl(var(--border-strong))",
                      borderRadius: "1px",
                    }}
                  />
                ))}
              </div>
            )}

            {/* Fetch error */}
            {fetchError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "7px",
                  padding: "8px 10px",
                  border: "1px solid hsl(var(--col-red) / 0.4)",
                  borderLeft: "2px solid hsl(var(--col-red))",
                  backgroundColor: "hsl(var(--col-red) / 0.06)",
                  borderRadius: "2px",
                }}
              >
                <AlertTriangle size={11} style={{ color: "hsl(var(--col-red))", flexShrink: 0, marginTop: "1px" }} />
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.88rem",
                    color: "hsl(var(--col-red))",
                  }}
                >
                  {fetchError}
                </p>
              </div>
            )}

            {/* Chunk data */}
            {chunkData && !isFetching && (
              <>
                {/* Metadata section */}
                <div
                  style={{
                    padding: "10px 12px",
                    border: "1px solid hsl(var(--border-base))",
                    borderRadius: "2px",
                    backgroundColor: "hsl(var(--bg-elevated))",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "hsl(var(--text-dim))",
                      marginBottom: "2px",
                    }}
                  >
                    DOCUMENT METADATA
                  </p>

                  {chunkData.metadata.system && (
                    <MetaRow label="SYSTEM" value={chunkData.metadata.system} />
                  )}
                  {chunkData.metadata.severity && (
                    <MetaRow label="SEVERITY" value={chunkData.metadata.severity} />
                  )}
                  {chunkData.metadata.event_date && (
                    <MetaRow label="DATE" value={chunkData.metadata.event_date} />
                  )}
                  {chunkData.metadata.asset_id && (
                    <MetaRow label="ASSET" value={chunkData.metadata.asset_id} />
                  )}
                  <MetaRow
                    label="CHUNK"
                    value={`${chunkData.chunk_index + 1} of incident ${chunkData.incident_id}`}
                  />
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    background:
                      "linear-gradient(to right, hsl(var(--col-cyan) / 0.3), hsl(var(--border-base)))",
                  }}
                />

                {/* Chunk text with highlight */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                  }}
                >
                  <FileText size={10} style={{ color: "hsl(var(--text-dim))", flexShrink: 0 }} />
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "hsl(var(--text-dim))",
                    }}
                  >
                    SOURCE EXCERPT
                  </p>
                </div>

                {activeCitation && currentCitation ? (
                  <HighlightedChunkText
                    chunkText={chunkData.chunk_text}
                    charStart={currentCitation.char_start}
                    charEnd={currentCitation.char_end}
                  />
                ) : (
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.9rem",
                      color: "hsl(var(--text-secondary))",
                      lineHeight: "1.7",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {chunkData.chunk_text}
                  </p>
                )}
              </>
            )}

            {/* No citation state */}
            {!isFetching && !fetchError && !chunkData && activeCitation?.citations.length === 0 && (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.85rem",
                  color: "hsl(var(--text-dim))",
                }}
              >
                No source chunk linked to this citation.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
