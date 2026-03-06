"use client";

// ============================================================
// ChatPanel.tsx — Terminal-style query interface
// Font sizes scaled up for readability
// ============================================================

import React, { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { SendHorizontal, AlertCircle, Terminal, Loader2, WifiOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { postQuery, getHealth } from "../lib/api";
import type { QueryResponse, Claim } from "../lib/api";
import { useRunContext } from "../lib/context";
import { useDomain } from "../lib/domain-context";
import CitationsDrawer from "./CitationsDrawer";

// ── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: QueryResponse;
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

function TypingIndicator() {
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
        PROCESSING
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { setRunData } = useRunContext();
  const { domain, config } = useDomain();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<ActiveCitationState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "ready" | "cold">("checking");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wake up Render free-tier backend on mount.
  // A GET /healthz has no preflight, so it works even while the service
  // is spinning up (unlike POST /query which needs a CORS preflight).
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSubmit = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || isLoading) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: query }]);
    setInputValue("");
    setIsLoading(true);
    setError(null);
    try {
      const response = await postQuery(query, domain);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: response.answer, response }]);
      setRunData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, setRunData]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  };

  const handleCitationClick = (claim: Claim, claimIndex: number) => {
    setActiveCitation({ claim, claimIndex });
    setDrawerOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "7px", padding: "8px 10px 10px" }}>

      {/* ── Message history ── */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto" style={{ paddingRight: "4px", display: "flex", flexDirection: "column", gap: "8px" }}>

          {messages.length === 0 && !isLoading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80px", paddingTop: "28px", gap: "10px" }}>
              <div style={{
                width: 36, height: 36,
                border: `1px solid hsl(var(${config.accentVar}) / 0.35)`,
                borderRadius: "2px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Terminal size={16} style={{ color: `hsl(var(${config.accentVar}) / 0.45)` }} />
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "hsl(var(--text-dim))", letterSpacing: "0.08em", textAlign: "center", lineHeight: "1.7" }}>
                AWAITING QUERY INPUT<br />
                <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>vector search · sql · graphrag · {config.label.toLowerCase()}</span>
              </p>
              {config.disclaimer && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "hsl(var(--col-amber))", textAlign: "center", maxWidth: "340px", lineHeight: "1.5", border: "1px solid hsl(var(--col-amber) / 0.3)", borderRadius: "2px", padding: "6px 10px" }}>
                  ⚠ {config.disclaimer}
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
                <div style={{
                  maxWidth: "92%", padding: "10px 12px",
                  borderRadius: "2px",
                  border: "1px solid hsl(var(--border-strong))",
                  borderLeft: "2px solid hsl(var(--col-cyan))",
                  backgroundColor: "hsl(var(--bg-elevated))",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px" }}>
                    <Terminal size={11} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "hsl(var(--col-cyan))", letterSpacing: "0.1em" }}>
                      NEXTAGENT RESPONSE
                    </span>
                  </div>
                  {msg.response
                    ? <AnswerWithCitations answer={msg.content} claims={msg.response.claims} onCitationClick={handleCitationClick} />
                    : <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.93rem", color: "hsl(var(--text-primary))", lineHeight: "1.6" }}>{msg.content}</p>
                  }
                  {msg.response?.claims?.length > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "0.55rem", letterSpacing: "0.14em", color: "hsl(var(--text-dim))" }}>
                        CLAIM CONFIDENCE
                      </span>
                      {msg.response.claims.map((claim, i) => {
                        const pct = Math.round(claim.confidence * 100);
                        const colour = claim.confidence >= 0.8
                          ? "var(--col-green)"
                          : claim.confidence >= 0.5
                          ? "var(--col-amber)"
                          : "var(--col-red)";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{
                              fontFamily: "var(--font-display)", fontSize: "0.6rem", fontWeight: 700,
                              letterSpacing: "0.08em", color: `hsl(${colour})`,
                              minWidth: "2.8rem", textAlign: "right",
                            }}>
                              {(claim.confidence).toFixed(2)}
                            </span>
                            <div style={{ flex: 1, height: "4px", backgroundColor: "hsl(var(--border-base))", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{
                                width: `${pct}%`, height: "100%",
                                backgroundColor: `hsl(${colour})`,
                                borderRadius: "2px",
                                transition: "width 0.4s ease",
                              }} />
                            </div>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: "0.7rem",
                              color: "hsl(var(--text-secondary))",
                              flex: 3,
                              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                            }}
                              title={claim.text}
                            >
                              [{i + 1}] {claim.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
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
              : "BACKEND WARMING UP — Render free-tier cold start (~60s). Your query will work once it's ready."}
          </span>
        </div>
      )}

      {/* ── Input row ── */}
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexShrink: 0 }}>
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
          onClick={() => void handleSubmit()}
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
  );
}
