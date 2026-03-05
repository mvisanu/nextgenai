"use client";

// ============================================================
// ChatPanel.tsx
// Implements: T-033-F
// - Text input + submit on Enter
// - Loading skeleton during in-flight POST /query
// - Answer rendered as markdown (react-markdown)
// - Error alert on failure
// - Scrollable message history
// - Input disabled while in-flight
// - run_id + full QueryResponse shared via RunContext
// - Citation links [N] rendered in answer text; clicking opens CitationsDrawer
// ============================================================

import React, { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { SendHorizontal, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

import { postQuery } from "../lib/api";
import type { QueryResponse, Claim } from "../lib/api";
import { useRunContext } from "../lib/context";
import CitationsDrawer from "./CitationsDrawer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Full QueryResponse — only set on assistant messages */
  response?: QueryResponse;
}

interface ActiveCitationState {
  claim: Claim;
  claimIndex: number;
}

// ---------------------------------------------------------------------------
// Helper: inject inline citation links into answer text
// Each [N] in the answer corresponds to claims[N-1].
// We render them as clickable spans that open the CitationsDrawer.
// ---------------------------------------------------------------------------

// Segment type: either a markdown text block or a citation marker
type Segment =
  | { kind: "text"; content: string }
  | { kind: "citation"; num: number; claimIndex: number };

function parseSegments(answer: string): Segment[] {
  const raw = answer.split(/(\[\d+\])/g);
  return raw.map((part): Segment => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return { kind: "citation", num, claimIndex: num - 1 };
    }
    return { kind: "text", content: part };
  });
}

function AnswerWithCitations({
  answer,
  claims,
  onCitationClick,
}: {
  answer: string;
  claims: Claim[];
  onCitationClick: (claim: Claim, index: number) => void;
}) {
  const segments = parseSegments(answer);

  return (
    <div className="text-sm leading-relaxed space-y-1">
      {segments.map((seg, i) => {
        if (seg.kind === "citation") {
          const claim = claims[seg.claimIndex];
          if (!claim) return null;
          return (
            <button
              key={i}
              onClick={() => onCitationClick(claim, seg.claimIndex)}
              className="inline-flex items-center justify-center h-5 w-6 rounded text-xs font-bold bg-accent text-accent-foreground hover:bg-accent/80 mx-0.5 align-middle cursor-pointer border border-border"
              aria-label={`View citation ${seg.num}`}
            >
              {seg.num}
            </button>
          );
        }
        // Render markdown text blocks using ReactMarkdown
        return seg.content ? (
          <ReactMarkdown
            key={i}
            components={{
              // Suppress wrapping <p> tags so inline citation buttons sit correctly
              p({ children }) {
                return <span className="block">{children}</span>;
              },
            }}
          >
            {seg.content}
          </ReactMarkdown>
        ) : null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel() {
  const { setRunData } = useRunContext();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] =
    useState<ActiveCitationState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await postQuery(query);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.answer,
        response,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setRunData(response);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, setRunData]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleCitationClick = (claim: Claim, claimIndex: number) => {
    setActiveCitation({ claim, claimIndex });
    setDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Message history */}
      <ScrollArea className="flex-1 rounded-md border bg-muted/30">
        <div ref={scrollRef} className="h-full overflow-y-auto p-3 space-y-4">
          {messages.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center pt-8">
              Ask a manufacturing or maintenance question to get started.
            </p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                }`}
              >
                {msg.role === "user" ? (
                  <p>{msg.content}</p>
                ) : msg.response ? (
                  <AnswerWithCitations
                    answer={msg.content}
                    claims={msg.response.claims}
                    onCitationClick={handleCitationClick}
                  />
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Loading skeleton while POST /query is in-flight */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] space-y-2 w-64">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error alert */}
      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Input row */}
      <div className="flex gap-2 shrink-0">
        <Textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to submit, Shift+Enter for new line)"
          disabled={isLoading}
          className="min-h-[60px] max-h-[120px] resize-none text-sm"
          rows={2}
        />
        <Button
          onClick={() => void handleSubmit()}
          disabled={isLoading || !inputValue.trim()}
          size="icon"
          className="shrink-0 self-end h-[60px] w-[60px]"
          aria-label="Submit query"
        >
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* Citations Drawer — opens when a citation link is clicked */}
      <CitationsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        activeCitation={activeCitation?.claim ?? null}
        citationIndex={activeCitation?.claimIndex ?? 0}
      />
    </div>
  );
}
