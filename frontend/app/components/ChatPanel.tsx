"use client";

// ============================================================
// ChatPanel.tsx — Terminal-style query interface
// Wave 3 additions:
//   - Session memory (UUID, conversation_history, session pill)
//   - History sidebar toggle (clock icon)
//   - SSE streaming synthesis with fallback
//   - Export button on assistant messages
//   - AGENT NOTES collapsible section
//   - Medical disclaimer banner
//   - pending_query localStorage check on mount
//   - ?run= share URL loading via useSearchParams
// ============================================================

import React, { useRef, useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import {
  SendHorizontal, AlertCircle, Terminal, Loader2, WifiOff,
  Trash2, Clock, Download, ChevronDown, ChevronUp,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSearchParams, useRouter } from "next/navigation";
import { postQuery, getHealth, getRun } from "../lib/api";
import type { QueryResponse, Claim, ConversationTurn } from "../lib/api";
import { useRunContext } from "../lib/context";
import { useDomain } from "../lib/domain-context";
import { useAuth } from "../lib/auth-context";
import CitationsDrawer from "./CitationsDrawer";
import HistorySidebar from "./HistorySidebar";

// @react-pdf/renderer calls StyleSheet.create at module load time which
// uses browser-only canvas APIs — must be loaded client-side only.
const ExportModal = dynamic(() => import("./ExportModal"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: QueryResponse;
  streaming?: boolean;
}

interface ActiveCitationState {
  claim: Claim;
  claimIndex: number;
}

// ── Citation segment parser ────────────────────────────────────────────────

type Segment =
  | { kind: "text"; content: string }
  | { kind: "citation"; num: number; claimIndex: number };

function parseSegments(answer: string): Segment[] {
  return answer.split(/(\[\d+\])/g).map((part): Segment => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return { kind: "citation", num, claimIndex: num - 1 };
    }
    return { kind: "text", content: part };
  });
}

function AnswerWithCitations({
  answer, claims, onCitationClick,
}: {
  answer: string;
  claims: Claim[];
  onCitationClick: (claim: Claim, index: number) => void;
}) {
  const segments = parseSegments(answer);
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.93rem", lineHeight: "1.7", color: "hsl(var(--text-primary))" }}>
      {segments.map((seg, i) => {
        if (seg.kind === "citation") {
          const claim = claims[seg.claimIndex];
          if (!claim) return null;
          return (
            <button
              key={i}
              onClick={() => onCitationClick(claim, seg.claimIndex)}
              title={`View citation ${seg.num}`}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "1.4rem", height: "1.4rem",
                marginInline: "2px",
                fontSize: "0.7rem", fontWeight: 700, fontFamily: "var(--font-display)",
                color: "hsl(var(--col-green))",
                border: "1px solid hsl(var(--col-green) / 0.6)",
                borderRadius: "2px",
                backgroundColor: "hsl(var(--col-green) / 0.08)",
                cursor: "pointer", verticalAlign: "middle",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.18)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 8px hsl(var(--col-green) / 0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.08)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              {seg.num}
            </button>
          );
        }
        return seg.content ? (
          <ReactMarkdown
            key={i}
            components={{
              p({ children }) { return <span className="block">{children}</span>; },
              code({ children }) {
                return (
                  <code style={{
                    color: "hsl(var(--col-cyan))",
                    backgroundColor: "hsl(var(--bg-elevated))",
                    padding: "0 5px", borderRadius: "2px", fontSize: "0.86rem",
                  }}>
                    {children}
                  </code>
                );
              },
              strong({ children }) {
                return <strong style={{ color: "hsl(var(--text-data))", fontWeight: 600 }}>{children}</strong>;
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

// ── Typing indicator ───────────────────────────────────────────────────────

function TypingIndicator({ streaming }: { streaming?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px" }}>
      <Terminal size={12} style={{ color: "hsl(var(--col-green))", flexShrink: 0 }} />
      <div style={{ display: "flex", gap: "4px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            backgroundColor: "hsl(var(--col-green))",
            animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--text-secondary))", letterSpacing: "0.08em" }}>
        {streaming ? "STREAMING" : "PROCESSING"}
      </span>
    </div>
  );
}

// ── Agent Notes collapsible ────────────────────────────────────────────────

function AgentNotes({ nextSteps, assumptions }: { nextSteps: string[]; assumptions: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (nextSteps.length === 0 && assumptions.length === 0) return null;

  return (
    <div style={{ marginTop: "10px", borderTop: "1px solid hsl(var(--border-base) / 0.5)", paddingTop: "8px" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "transparent", border: "none", cursor: "pointer",
          padding: "0",
        }}
      >
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.52rem", fontWeight: 700,
          letterSpacing: "0.14em",
          color: "hsl(var(--col-amber))",
        }}>
          AGENT NOTES
        </span>
        {expanded
          ? <ChevronUp size={10} style={{ color: "hsl(var(--col-amber))" }} />
          : <ChevronDown size={10} style={{ color: "hsl(var(--col-amber))" }} />
        }
      </button>

      {expanded && (
        <div style={{ marginTop: "7px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {assumptions.length > 0 && (
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.12em", color: "hsl(var(--col-amber) / 0.7)", marginBottom: "4px" }}>
                ASSUMPTIONS
              </p>
              {assumptions.map((a, i) => (
                <p key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "hsl(var(--col-amber) / 0.8)", lineHeight: "1.5", marginBottom: "2px" }}>
                  — {a}
                </p>
              ))}
            </div>
          )}
          {nextSteps.length > 0 && (
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.48rem", fontWeight: 700, letterSpacing: "0.12em", color: "hsl(var(--col-amber) / 0.7)", marginBottom: "4px" }}>
                NEXT STEPS
              </p>
              {nextSteps.map((s, i) => (
                <p key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "hsl(var(--col-amber) / 0.8)", lineHeight: "1.5", marginBottom: "2px" }}>
                  {i + 1}. {s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sample queries ─────────────────────────────────────────────────────────

const SAMPLE_QUERIES_AIRCRAFT = [
  {
    id: "a1",
    intent: "VECTOR",
    intentColor: "--col-cyan",
    query: "Find incidents similar to: hydraulic leak near actuator, suspected seal degradation, unit reworked.",
  },
  {
    id: "a2",
    intent: "SQL",
    intentColor: "--col-amber",
    query: "Show defect trends by product line for the last 90 days and highlight any product with more than 10% defect rate.",
  },
  {
    id: "a3",
    intent: "HYBRID",
    intentColor: "--col-purple",
    query: "What are the most common avionics failure modes and which product lines are most affected?",
  },
];

const SAMPLE_QUERIES_MEDICAL = [
  {
    id: "m1",
    intent: "VECTOR",
    intentColor: "--col-cyan",
    query: "Find cases similar to: 58-year-old male, ST-elevation, chest pain radiating to jaw, troponin positive.",
  },
  {
    id: "m2",
    intent: "SQL",
    intentColor: "--col-amber",
    query: "Show disease frequency by specialty for the last 6 months and highlight the top 3 diagnoses.",
  },
  {
    id: "m3",
    intent: "HYBRID",
    intentColor: "--col-purple",
    query: "What are the most common respiratory presentations and what outcomes are associated with them?",
  },
];

// ── Inner component that uses useSearchParams ──────────────────────────────

// Per-domain session snapshot type
type DomainSnapshot = {
  messages: Message[];
  sessionId: string | null;
  conversationHistory: ConversationTurn[];
  runData: QueryResponse | null;
};

function emptySnapshot(): DomainSnapshot {
  return { messages: [], sessionId: null, conversationHistory: [], runData: null };
}

function ChatPanelInner() {
  const { setRunData } = useRunContext();
  const { domain, setDomain, config } = useDomain();
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<ActiveCitationState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "ready" | "cold">("checking");
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [exportModal, setExportModal] = useState<{ open: boolean; runData: QueryResponse | null }>({
    open: false, runData: null,
  });

  // Session state — NOT stored in localStorage; resets on clear or page reload
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);

  // Per-domain session snapshots — keyed by domain, swapped on domain switch
  const domainSnapshotsRef = useRef<Record<string, DomainSnapshot>>({
    aircraft: emptySnapshot(),
    medical: emptySnapshot(),
  });
  // Mirror of current state for reading inside effects without stale closure issues
  const currentStateRef = useRef({ messages, sessionId, conversationHistory });
  currentStateRef.current = { messages, sessionId, conversationHistory };
  const prevDomainRef = useRef<string>(domain);

  // On domain switch: save current domain's state, restore new domain's state
  useEffect(() => {
    const prev = prevDomainRef.current;
    if (prev === domain) return;
    prevDomainRef.current = domain;

    // Save current state into the previous domain's snapshot
    const cur = currentStateRef.current;
    domainSnapshotsRef.current[prev] = {
      messages: cur.messages,
      sessionId: cur.sessionId,
      conversationHistory: cur.conversationHistory,
      runData: domainSnapshotsRef.current[prev].runData,
    };

    // Restore new domain's snapshot
    const saved = domainSnapshotsRef.current[domain] ?? emptySnapshot();
    setMessages(saved.messages);
    setSessionId(saved.sessionId);
    setConversationHistory(saved.conversationHistory);
    setRunData(saved.runData);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  // Wrapper that sets runData in context AND persists it to the domain snapshot
  const updateRunData = useCallback((data: QueryResponse | null) => {
    setRunData(data);
    domainSnapshotsRef.current[domain] = {
      ...(domainSnapshotsRef.current[domain] ?? emptySnapshot()),
      runData: data,
    };
  }, [domain, setRunData]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether auto-submit from pending_query has been attempted
  const pendingQueryProcessed = useRef(false);
  const streamingMessageId = useRef<string | null>(null);

  // Wake up Render backend on mount
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    let timer: ReturnType<typeof setTimeout>;

    const ping = async () => {
      try {
        await getHealth();
        if (!cancelled) setApiStatus("ready");
      } catch {
        if (!cancelled) {
          retryCount++;
          setApiStatus("cold");
          if (retryCount < 15) timer = setTimeout(ping, 8_000);
        }
      }
    };

    ping();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Load run from ?run= search param on mount
  useEffect(() => {
    const runId = searchParams.get("run");
    if (!runId) return;
    let cancelled = false;
    async function loadSharedRun() {
      try {
        const fullRun = await getRun(runId!, accessToken ?? undefined);
        if (!cancelled) {
          updateRunData(fullRun);
          // Populate ChatPanel with the shared run's content as message bubbles
          setMessages([
            { id: crypto.randomUUID(), role: "user", content: fullRun.query },
            { id: crypto.randomUUID(), role: "assistant", content: fullRun.answer, response: fullRun },
          ]);
          // Clear the ?run= param from URL without reload
          router.replace("/");
        }
      } catch {
        // Silently ignore — URL may be stale
      }
    }
    void loadSharedRun();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check localStorage for pending_query on mount (from examples page)
  useEffect(() => {
    if (pendingQueryProcessed.current) return;
    try {
      const pendingQuery = localStorage.getItem("pending_query");
      const pendingDomain = localStorage.getItem("pending_domain") as "aircraft" | "medical" | null;

      if (pendingQuery) {
        pendingQueryProcessed.current = true;
        if (pendingDomain === "aircraft" || pendingDomain === "medical") {
          setDomain(pendingDomain);
        }
        setInputValue(pendingQuery);
        // Auto-submit after 300ms debounce to allow health check to settle
        const timer = setTimeout(() => {
          // Clear localStorage keys before submitting
          localStorage.removeItem("pending_query");
          localStorage.removeItem("pending_domain");
          // Trigger submit directly — setInputValue is async so we pass value directly
          void submitQuery(pendingQuery);
        }, 300);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  // Core submit logic — accepts explicit query text to support auto-submit from pending_query
  const submitQuery = useCallback(async (queryText?: string) => {
    const query = (queryText ?? inputValue).trim();
    if (!query || isLoading) return;

    // Generate session_id on first query of this session
    const currentSessionId = sessionId ?? crypto.randomUUID();
    if (!sessionId) setSessionId(currentSessionId);

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: query }]);
    if (!queryText) setInputValue(""); // only clear if not auto-submit (auto-submit clears in useEffect)
    setIsLoading(true);
    setError(null);
    setRetryStatus(null);

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 4000;
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    const isNetworkError = (err: unknown): boolean => {
      if (!(err instanceof Error)) return false;
      const msg = err.message.toLowerCase();
      return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network error");
    };

    // Prepare conversation history for this request (max 5 turns)
    const historyForRequest = conversationHistory.slice(-5);

    // ── Try SSE streaming first ──
    let streamingSucceeded = false;
    const msgId = crypto.randomUUID();
    streamingMessageId.current = msgId;

    try {
      const response = await fetch(`${BASE_URL}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query,
          domain,
          session_id: currentSessionId,
          conversation_history: historyForRequest.length > 0 ? historyForRequest : null,
        }),
      });

      // If server returns SSE content-type, parse stream
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("text/event-stream")) {
        streamingSucceeded = true;

        // Insert placeholder streaming message
        setMessages((prev) => [
          ...prev,
          { id: msgId, role: "assistant", content: "", streaming: true },
        ]);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let streamedText = "";
        let finalRun: QueryResponse | null = null;

        if (reader) {
          let done = false;
          // Buffer accumulates raw SSE bytes across multiple reader.read() calls.
          // The done event JSON (with full evidence) can be 10–50 KB and typically
          // arrives split across several TCP chunks. Splitting per-chunk by "\n"
          // produces incomplete JSON → JSON.parse throws → event silently dropped.
          // Instead we buffer and split on "\n\n" (the SSE event separator) so
          // we only parse complete events.
          let sseBuffer = "";
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              sseBuffer += decoder.decode(value, { stream: !done });
            }
            // Extract all complete SSE events (separated by blank line \n\n).
            // Keep any trailing incomplete event fragment in the buffer.
            const eventBlocks = sseBuffer.split("\n\n");
            sseBuffer = eventBlocks.pop() ?? "";
            for (const block of eventBlocks) {
              // Each block may have multiple "data: ..." lines — join them.
              const jsonStr = block
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5))
                .join("")
                .trim();
              if (!jsonStr) continue;
              try {
                const event = JSON.parse(jsonStr) as { type: string; text?: string; run?: QueryResponse; message?: string };
                if (event.type === "token" && event.text) {
                  streamedText += event.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId ? { ...m, content: streamedText } : m
                    )
                  );
                } else if (event.type === "done" && event.run) {
                  finalRun = event.run;
                } else if (event.type === "error") {
                  throw new Error(event.message ?? "Stream error");
                }
              } catch {
                // Malformed SSE event block — skip
              }
            }
          }
          // Process any remaining buffer content after stream closes
          // (handles servers that don't append a trailing \n\n).
          if (sseBuffer.trim()) {
            const jsonStr = sseBuffer
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5))
              .join("")
              .trim();
            if (jsonStr) {
              try {
                const event = JSON.parse(jsonStr) as { type: string; text?: string; run?: QueryResponse; message?: string };
                if (event.type === "done" && event.run) {
                  finalRun = event.run;
                }
              } catch { /* incomplete trailing data — ignore */ }
            }
          }
        }

        if (finalRun) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: finalRun!.answer, response: finalRun!, streaming: false }
                : m
            )
          );
          updateRunData(finalRun);

          // Accumulate conversation history (max 5 turns)
          const summary = finalRun.answer.slice(0, 200);
          setConversationHistory((prev) =>
            [...prev, { query, answer_summary: summary }].slice(-5)
          );
        } else {
          // Stream ended without done event — remove placeholder, fall through to non-streaming
          setMessages((prev) => prev.filter((m) => m.id !== msgId));
          streamingSucceeded = false;
        }
      }
    } catch {
      // SSE attempt failed — fall through to non-streaming
      streamingSucceeded = false;
      // Remove placeholder if it was inserted
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    }

    if (streamingSucceeded) {
      setRetryStatus(null);
      setIsLoading(false);
      return;
    }

    // ── Fallback: non-streaming with retry ──
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await postQuery(
          query,
          domain,
          undefined,
          currentSessionId,
          historyForRequest.length > 0 ? historyForRequest : null,
          accessToken ?? undefined
        );
        setRetryStatus(null);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: response.answer, response },
        ]);
        updateRunData(response);

        const summary = response.answer.slice(0, 200);
        setConversationHistory((prev) =>
          [...prev, { query, answer_summary: summary }].slice(-5)
        );

        setIsLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        if (!isNetworkError(err)) break;
        if (attempt < MAX_RETRIES) {
          setRetryStatus(`Connection issue, retrying... (${attempt}/${MAX_RETRIES - 1})`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    setRetryStatus(null);
    const isNetwork = isNetworkError(lastErr);
    setError(
      isNetwork
        ? "Backend is temporarily unavailable. Please try again in a moment."
        : lastErr instanceof Error
        ? lastErr.message
        : "An unexpected error occurred."
    );
    setIsLoading(false);
  }, [inputValue, isLoading, updateRunData, domain, sessionId, conversationHistory]);

  const handleSubmit = useCallback(() => void submitQuery(), [submitQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleCitationClick = (claim: Claim, claimIndex: number) => {
    setActiveCitation({ claim, claimIndex });
    setDrawerOpen(true);
  };

  const handleClear = useCallback(() => {
    setMessages([]);
    setInputValue("");
    setError(null);
    updateRunData(null);
    // Reset session (current domain only)
    setSessionId(null);
    setConversationHistory([]);
    domainSnapshotsRef.current[domain] = emptySnapshot();
  }, [updateRunData, domain]);

  const sessionTurns = conversationHistory.length;
  const showSessionPill = sessionTurns >= 1;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── History sidebar ── */}
      <HistorySidebar open={historySidebarOpen} onClose={() => setHistorySidebarOpen(false)} />

      {/* ── Main chat area ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "7px", padding: "8px 10px 10px", minWidth: 0 }}>

        {/* ── Chat header row: session pill + history toggle ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* History sidebar toggle */}
          <button
            onClick={() => setHistorySidebarOpen((v) => !v)}
            aria-label="Toggle query history"
            title="Query history"
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "3px 8px",
              backgroundColor: historySidebarOpen ? "hsl(var(--col-cyan) / 0.1)" : "transparent",
              border: `1px solid ${historySidebarOpen ? "hsl(var(--col-cyan) / 0.5)" : "hsl(var(--border-base))"}`,
              borderRadius: "2px",
              cursor: "pointer",
              color: historySidebarOpen ? "hsl(var(--col-cyan))" : "hsl(var(--text-dim))",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!historySidebarOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-cyan))";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-cyan) / 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!historySidebarOpen) {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
              }
            }}
          >
            <Clock size={11} />
            <span className="nav-link-text">HISTORY</span>
          </button>

          {/* Session active pill */}
          {showSessionPill && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              padding: "2px 8px",
              borderRadius: "2px",
              border: "1px solid hsl(var(--col-green) / 0.4)",
              color: "hsl(var(--col-green))",
              backgroundColor: "hsl(var(--col-green) / 0.07)",
              letterSpacing: "0.06em",
            }}>
              Session active • {sessionTurns} {sessionTurns === 1 ? "turn" : "turns"}
            </span>
          )}
        </div>

        {/* ── Message history ── */}
        <ScrollArea className="flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto" style={{ paddingRight: "4px", display: "flex", flexDirection: "column", gap: "8px" }}>

            {messages.length === 0 && !isLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80px", paddingTop: "20px", gap: "16px", paddingBottom: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    width: 36, height: 36,
                    border: `1px solid hsl(var(${config.accentVar}) / 0.35)`,
                    borderRadius: "2px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Terminal size={16} style={{ color: `hsl(var(${config.accentVar}) / 0.45)` }} />
                  </div>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "hsl(var(--text-dim))", letterSpacing: "0.08em", textAlign: "center", lineHeight: "1.7" }}>
                    AWAITING QUERY INPUT<br />
                    <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>vector search · sql · graphrag · {config.label.toLowerCase()}</span>
                  </p>
                </div>

                <div style={{ width: "100%", maxWidth: "540px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{
                    fontFamily: "var(--font-display)", fontSize: "0.5rem", fontWeight: 700,
                    letterSpacing: "0.18em", color: "hsl(var(--text-dim))",
                    textAlign: "center",
                  }}>
                    TRY A SAMPLE QUERY
                  </span>
                  {(domain === "medical" ? SAMPLE_QUERIES_MEDICAL : SAMPLE_QUERIES_AIRCRAFT).map((sq) => (
                    <button
                      key={sq.id}
                      onClick={() => setInputValue(sq.query)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: "8px",
                        padding: "7px 10px",
                        border: `1px solid hsl(var(--border-base))`,
                        borderLeft: `2px solid hsl(var(${sq.intentColor}) / 0.5)`,
                        borderRadius: "2px",
                        backgroundColor: "hsl(var(--bg-elevated))",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = `hsl(var(${sq.intentColor}) / 0.06)`;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = `hsl(var(${sq.intentColor}) / 0.35)`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--bg-elevated))";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
                      }}
                    >
                      <span style={{
                        fontFamily: "var(--font-display)", fontSize: "0.45rem", fontWeight: 700,
                        letterSpacing: "0.12em", color: `hsl(var(${sq.intentColor}))`,
                        border: `1px solid hsl(var(${sq.intentColor}) / 0.4)`,
                        borderRadius: "2px", padding: "1px 5px",
                        backgroundColor: `hsl(var(${sq.intentColor}) / 0.08)`,
                        flexShrink: 0, marginTop: "1px",
                      }}>
                        {sq.intent}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: "0.68rem",
                        color: "hsl(var(--text-secondary))", lineHeight: "1.5",
                      }}>
                        {sq.query}
                      </span>
                    </button>
                  ))}
                </div>

                {config.disclaimer && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "hsl(var(--col-amber))", textAlign: "center", maxWidth: "400px", lineHeight: "1.5", border: "1px solid hsl(var(--col-amber) / 0.3)", borderRadius: "2px", padding: "6px 10px" }}>
                    {config.disclaimer}
                  </p>
                )}
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className="msg-animate"
                style={{ animationDelay: `${idx * 0.02}s`, display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}
              >
                {msg.role === "user" ? (
                  <div style={{
                    maxWidth: "88%", padding: "8px 12px",
                    borderRadius: "2px",
                    border: "1px solid hsl(var(--col-green) / 0.35)",
                    backgroundColor: "hsl(var(--col-green) / 0.06)",
                    fontFamily: "var(--font-mono)", fontSize: "0.93rem",
                    color: "hsl(var(--col-green))", lineHeight: "1.55",
                  }}>
                    <span style={{ display: "block", fontSize: "0.65rem", color: "hsl(var(--text-dim))", letterSpacing: "0.12em", marginBottom: "4px", textAlign: "right" }}>
                      OPERATOR &gt;
                    </span>
                    {msg.content}
                  </div>
                ) : (
                  <div
                    style={{
                      maxWidth: "92%", padding: "10px 12px",
                      borderRadius: "2px",
                      border: "1px solid hsl(var(--border-strong))",
                      borderLeft: "2px solid hsl(var(--col-cyan))",
                      backgroundColor: "hsl(var(--bg-elevated))",
                      position: "relative",
                    }}
                    // Show export button on hover
                    onMouseEnter={(e) => {
                      const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>(".export-btn");
                      if (btn) btn.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      const btn = (e.currentTarget as HTMLDivElement).querySelector<HTMLButtonElement>(".export-btn");
                      if (btn) btn.style.opacity = "0";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px" }}>
                      <Terminal size={11} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--col-cyan))", letterSpacing: "0.1em", flex: 1 }}>
                        NEXTAGENT RESPONSE
                        {msg.streaming && (
                          <span style={{ marginLeft: "8px", color: "hsl(var(--col-green))", fontSize: "0.6rem" }}>
                            streaming…
                          </span>
                        )}
                      </span>
                      {/* Export button — visible on hover, only for completed messages */}
                      {msg.response && !msg.streaming && (
                        <button
                          className="export-btn"
                          onClick={() => setExportModal({ open: true, runData: msg.response! })}
                          aria-label="Export result"
                          title="Export result"
                          style={{
                            opacity: 0,
                            transition: "opacity 0.15s",
                            background: "transparent",
                            border: "1px solid hsl(var(--border-base))",
                            borderRadius: "2px",
                            cursor: "pointer",
                            padding: "3px 5px",
                            color: "hsl(var(--text-dim))",
                            display: "flex", alignItems: "center", gap: "3px",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-cyan))";
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-cyan) / 0.5)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))";
                            (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
                          }}
                        >
                          <Download size={10} />
                        </button>
                      )}
                    </div>

                    {msg.response && !msg.streaming
                      ? <AnswerWithCitations answer={msg.content} claims={msg.response.claims} onCitationClick={handleCitationClick} />
                      : <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.93rem", color: "hsl(var(--text-primary))", lineHeight: "1.6" }}>{msg.content}</p>
                    }

                    {(msg.response?.claims?.length ?? 0) > 0 && !msg.streaming && (
                      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
                          CLAIM CONFIDENCE
                        </span>
                        {(msg.response?.claims ?? []).map((claim, i) => {
                          const pct = Math.round(claim.confidence * 100);
                          const colour = claim.confidence >= 0.7
                            ? "var(--col-green)"
                            : claim.confidence >= 0.4
                            ? "var(--col-amber)"
                            : "var(--col-red)";
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                              <span style={{
                                fontFamily: "var(--font-display)", fontSize: "0.6rem", fontWeight: 700,
                                letterSpacing: "0.08em", color: `hsl(${colour})`,
                                minWidth: "2.8rem", textAlign: "right", paddingTop: "2px",
                              }}>
                                {pct}%
                              </span>
                              <div style={{ flex: 1, height: "4px", backgroundColor: "hsl(var(--border-base))", borderRadius: "2px", overflow: "hidden", marginTop: "6px" }}>
                                <div style={{
                                  width: `${pct}%`, height: "100%",
                                  backgroundColor: `hsl(${colour})`,
                                  borderRadius: "2px",
                                  transition: "width 0.4s ease",
                                }} />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "5px", flex: 3 }}>
                                <span style={{
                                  fontFamily: "var(--font-mono)", fontSize: "0.7rem",
                                  color: "hsl(var(--text-secondary))",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                                  title={claim.text}
                                >
                                  [{i + 1}] {claim.text}
                                </span>
                                {claim.conflict_flagged && (
                                  <span style={{
                                    fontFamily: "var(--font-display)",
                                    fontSize: "0.42rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.1em",
                                    padding: "1px 4px",
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
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* AGENT NOTES */}
                    {msg.response && !msg.streaming && (
                      <AgentNotes
                        nextSteps={msg.response.next_steps ?? []}
                        assumptions={msg.response.assumptions ?? []}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "8px 12px",
                  border: "1px solid hsl(var(--border-strong))",
                  borderLeft: "2px solid hsl(var(--col-cyan))",
                  backgroundColor: "hsl(var(--bg-elevated))",
                  borderRadius: "2px", minWidth: "180px",
                }}>
                  <TypingIndicator />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "4px 0" }}>
                    {[1, 0.75, 0.6].map((w, i) => (
                      <div key={i} style={{ height: "11px", width: `${w * 100}%`, backgroundColor: "hsl(var(--border-strong))", borderRadius: "1px" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Retry status ── */}
        {retryStatus && (
          <div style={{
            display: "flex", alignItems: "center", gap: "9px", padding: "9px 12px",
            border: "1px solid hsl(var(--col-amber) / 0.5)",
            borderLeft: "2px solid hsl(var(--col-amber))",
            backgroundColor: "hsl(var(--col-amber) / 0.06)",
            borderRadius: "2px", flexShrink: 0,
          }}>
            <Loader2 size={14} style={{ color: "hsl(var(--col-amber))", animation: "spin 1s linear infinite", flexShrink: 0 }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.84rem", color: "hsl(var(--col-amber))" }}>
              {retryStatus}
            </p>
          </div>
        )}

        {/* ── Error alert ── */}
        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "9px", padding: "9px 12px",
            border: "1px solid hsl(var(--col-red) / 0.5)",
            borderLeft: "2px solid hsl(var(--col-red))",
            backgroundColor: "hsl(var(--col-red) / 0.06)",
            borderRadius: "2px", flexShrink: 0,
          }}>
            <AlertCircle size={14} style={{ color: "hsl(var(--col-red))", marginTop: "1px", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.15em", color: "hsl(var(--col-red))", marginBottom: "3px" }}>
                QUERY ERROR
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.84rem", color: "hsl(var(--text-secondary))" }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* ── API status banner ── */}
        {apiStatus !== "ready" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px",
            border: `1px solid hsl(var(${apiStatus === "checking" ? "--col-cyan" : "--col-amber"}) / 0.4)`,
            borderLeft: `2px solid hsl(var(${apiStatus === "checking" ? "--col-cyan" : "--col-amber"}))`,
            backgroundColor: `hsl(var(${apiStatus === "checking" ? "--col-cyan" : "--col-amber"}) / 0.05)`,
            borderRadius: "2px", flexShrink: 0,
          }}>
            {apiStatus === "checking"
              ? <Loader2 size={12} style={{ color: "hsl(var(--col-cyan))", animation: "spin 1s linear infinite", flexShrink: 0 }} />
              : <WifiOff size={12} style={{ color: "hsl(var(--col-amber))", flexShrink: 0 }} />
            }
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: `hsl(var(${apiStatus === "checking" ? "--col-cyan" : "--col-amber"}))`, letterSpacing: "0.08em" }}>
              {apiStatus === "checking"
                ? "CONNECTING TO BACKEND…"
                : "BACKEND WARMING UP — Server cold start in progress. Your query will work once it's ready."}
            </span>
          </div>
        )}

        {/* ── Medical disclaimer banner — persistent when domain=medical ── */}
        {domain === "medical" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px",
            border: "1px solid hsl(var(--col-amber) / 0.4)",
            borderLeft: "2px solid hsl(var(--col-amber))",
            backgroundColor: "hsl(var(--col-amber) / 0.05)",
            borderRadius: "2px", flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "hsl(var(--col-amber))", letterSpacing: "0.04em", lineHeight: "1.4" }}>
              Clinical data is for research only. Not for diagnostic or treatment decisions.
            </span>
          </div>
        )}

        {/* ── Input row ── */}
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
          {messages.length > 0 && !isLoading && (
            <button
              onClick={handleClear}
              aria-label="Clear conversation"
              title="Clear conversation"
              style={{
                width: "36px", height: "58px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent",
                border: "1px solid hsl(var(--border-base))",
                borderRadius: "2px",
                cursor: "pointer",
                color: "hsl(var(--text-dim))",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-red))";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-red) / 0.5)";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-red) / 0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.queryPlaceholder}
            disabled={isLoading}
            rows={2}
            className="industrial-textarea flex-1"
            style={{ padding: "9px 11px", minHeight: "58px", maxHeight: "110px" }}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || !inputValue.trim()}
            aria-label="Submit query"
            style={{
              width: "58px", height: "58px", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: (isLoading || !inputValue.trim()) ? "hsl(var(--bg-elevated))" : "hsl(var(--col-green) / 0.12)",
              border: `1px solid ${(isLoading || !inputValue.trim()) ? "hsl(var(--border-base))" : "hsl(var(--col-green) / 0.6)"}`,
              borderRadius: "2px",
              cursor: (isLoading || !inputValue.trim()) ? "not-allowed" : "pointer",
              color: (isLoading || !inputValue.trim()) ? "hsl(var(--text-dim))" : "hsl(var(--col-green))",
              boxShadow: (isLoading || !inputValue.trim()) ? "none" : "0 0 12px hsl(var(--col-green) / 0.2)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isLoading && inputValue.trim()) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.2)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 18px hsl(var(--col-green) / 0.35)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && inputValue.trim()) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-green) / 0.12)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 12px hsl(var(--col-green) / 0.2)";
              }
            }}
          >
            <SendHorizontal size={18} />
          </button>
        </div>

        <CitationsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          activeCitation={activeCitation?.claim ?? null}
          citationIndex={activeCitation?.claimIndex ?? 0}
        />
      </div>

      {/* ── Export modal ── */}
      {exportModal.open && exportModal.runData && (
        <ExportModal
          open={exportModal.open}
          onClose={() => setExportModal({ open: false, runData: null })}
          runData={exportModal.runData}
        />
      )}
    </div>
  );
}

// ── Wrapper with Suspense for useSearchParams ──────────────────────────────

export default function ChatPanel() {
  return (
    <Suspense fallback={<div style={{ flex: 1 }} />}>
      <ChatPanelInner />
    </Suspense>
  );
}
