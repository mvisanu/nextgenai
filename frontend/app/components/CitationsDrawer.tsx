"use client";

// ============================================================
// CitationsDrawer.tsx
// Implements: T-036-F
// - shadcn/ui Sheet from the right side
// - Fetches chunk via getChunk(doc_id, chunk_id) on open
// - Displays full chunk_text with cited span highlighted via <mark>
// - Confidence badge: green ≥0.7, yellow 0.4–0.69, red <0.4
// - Closes on Escape or outside click (Sheet handles both natively)
// - Shows conflict_note as a warning if present
// ============================================================

import React, { useEffect, useState } from "react";
import { AlertTriangle, BookOpen } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { getChunk } from "../lib/api";
import type { Claim, ChunkResponse } from "../lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CitationsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The claim whose first citation will be fetched and displayed */
  activeCitation: Claim | null;
  /** 0-based index of the claim in the claims array (for display as [N]) */
  citationIndex: number;
}

// ---------------------------------------------------------------------------
// Confidence badge colour mapping (T-036-F spec)
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  let className: string;
  let label: string;

  if (confidence >= 0.7) {
    className = "bg-green-100 text-green-800 border-green-200";
    label = "High";
  } else if (confidence >= 0.4) {
    className = "bg-yellow-100 text-yellow-800 border-yellow-200";
    label = "Medium";
  } else {
    className = "bg-red-100 text-red-800 border-red-200";
    label = "Low";
  }

  return (
    <Badge variant="outline" className={cn("text-xs", className)}>
      {label} confidence ({(confidence * 100).toFixed(0)}%)
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Highlighted chunk text
// Split chunk_text around char_start..char_end and wrap the cited span in <mark>
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
  const before = chunkText.slice(0, charStart);
  const highlighted = chunkText.slice(charStart, charEnd);
  const after = chunkText.slice(charEnd);

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {before}
      <mark className="citation-highlight bg-accent text-accent-foreground rounded px-0.5">
        {highlighted}
      </mark>
      {after}
    </p>
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

  // Fetch chunk whenever the drawer opens with a new citation
  useEffect(() => {
    if (!open || !activeCitation || activeCitation.citations.length === 0) {
      return;
    }

    const citation = activeCitation.citations[0];
    let cancelled = false;

    async function fetchChunk() {
      setIsFetching(true);
      setFetchError(null);
      setChunkData(null);

      try {
        const data = await getChunk(citation.incident_id, citation.chunk_id);
        if (!cancelled) {
          setChunkData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : "Failed to load source chunk."
          );
        }
      } finally {
        if (!cancelled) {
          setIsFetching(false);
        }
      }
    }

    void fetchChunk();

    return () => {
      cancelled = true;
    };
  }, [open, activeCitation]);

  // Clear state when drawer closes
  useEffect(() => {
    if (!open) {
      setChunkData(null);
      setFetchError(null);
      setIsFetching(false);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:w-[540px] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Citation [{citationIndex + 1}]
          </SheetTitle>
          {activeCitation && (
            <SheetDescription asChild>
              <div className="space-y-2 pt-1">
                {/* Claim text */}
                <p className="text-sm text-foreground font-medium leading-snug">
                  {activeCitation.text}
                </p>

                {/* Confidence badge */}
                <ConfidenceBadge confidence={activeCitation.confidence} />

                {/* Conflict note */}
                {activeCitation.conflict_note && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <AlertDescription className="text-xs ml-1">
                      {activeCitation.conflict_note}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        <Separator className="my-3 shrink-0" />

        {/* Source chunk body */}
        <ScrollArea className="flex-1">
          <div className="pr-2 space-y-4">
            {isFetching && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}

            {fetchError && (
              <Alert variant="destructive">
                <AlertDescription>{fetchError}</AlertDescription>
              </Alert>
            )}

            {chunkData && !isFetching && (
              <>
                {/* Chunk metadata */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {chunkData.metadata.system && (
                    <span>
                      System:{" "}
                      <span className="text-foreground font-medium">
                        {chunkData.metadata.system}
                      </span>
                    </span>
                  )}
                  {chunkData.metadata.severity && (
                    <span>
                      Severity:{" "}
                      <span className="text-foreground font-medium">
                        {chunkData.metadata.severity}
                      </span>
                    </span>
                  )}
                  {chunkData.metadata.event_date && (
                    <span>
                      Date:{" "}
                      <span className="text-foreground font-medium">
                        {chunkData.metadata.event_date}
                      </span>
                    </span>
                  )}
                  {chunkData.metadata.asset_id && (
                    <span>
                      Asset:{" "}
                      <span className="text-foreground font-medium">
                        {chunkData.metadata.asset_id}
                      </span>
                    </span>
                  )}
                </div>

                <Separator />

                {/* Full chunk text with citation highlighted */}
                {activeCitation && activeCitation.citations.length > 0 ? (
                  <HighlightedChunkText
                    chunkText={chunkData.chunk_text}
                    charStart={activeCitation.citations[0].char_start}
                    charEnd={activeCitation.citations[0].char_end}
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {chunkData.chunk_text}
                  </p>
                )}

                {/* Chunk index */}
                <p className="text-xs text-muted-foreground">
                  Chunk {chunkData.chunk_index + 1} of incident{" "}
                  <code className="font-mono text-xs">
                    {chunkData.incident_id}
                  </code>
                </p>
              </>
            )}

            {/* No citation data state */}
            {!isFetching && !fetchError && !chunkData && activeCitation?.citations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No source chunk linked to this citation.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
