"use client";

// ============================================================
// ExportModal.tsx — PDF and JSON export for query results
// Epic 5 — Export & Reporting
// Uses @react-pdf/renderer for PDF; JSON.stringify for JSON
// ============================================================

import React, { useState, useCallback } from "react";
import { X, Download, FileJson, FileText, Loader2 } from "lucide-react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { QueryResponse } from "../lib/api";

// ---------------------------------------------------------------------------
// PDF Template styles
// ---------------------------------------------------------------------------

const pdfStyles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: "#0a0f0a",
    color: "#c8d8c8",
    fontFamily: "Courier",
  },
  header: {
    marginBottom: 18,
    borderBottom: "1 solid #1e3a1e",
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 14,
    color: "#00ff88",
    marginBottom: 4,
    letterSpacing: 2,
  },
  headerMeta: {
    fontSize: 8,
    color: "#667766",
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 10,
    color: "#00ccaa",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
    borderBottom: "0.5 solid #1e3a2e",
    paddingBottom: 3,
  },
  answerText: {
    fontSize: 9,
    color: "#b8d4b8",
    lineHeight: 1.6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f1f0f",
    padding: "4 6",
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    padding: "3 6",
    borderBottom: "0.5 solid #152015",
  },
  tableCell: {
    fontSize: 7.5,
    color: "#9ab49a",
  },
  cellClaim: { flex: 3 },
  cellConf: { flex: 1, color: "#00ccaa" },
  cellCit: { flex: 1, color: "#6699aa" },
  cellSource: { flex: 2 },
  cellExcerpt: { flex: 3 },
  cellScore: { flex: 1, color: "#00ccaa" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTop: "0.5 solid #1e3a1e",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#445544",
  },
});

// ---------------------------------------------------------------------------
// PDF Document component
// ---------------------------------------------------------------------------

function ExportPdfDocument({ data }: { data: QueryResponse }) {
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        {/* Header */}
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.headerTitle}>NEXTAGENTAI — Query Report</Text>
          <Text style={pdfStyles.headerMeta}>Query: {data.query}</Text>
          <Text style={pdfStyles.headerMeta}>Run ID: {data.run_id}</Text>
          <Text style={pdfStyles.headerMeta}>Generated: {timestamp}</Text>
        </View>

        {/* Section 1: Answer */}
        <Text style={pdfStyles.sectionTitle}>ANSWER</Text>
        <Text style={pdfStyles.answerText}>{data.answer}</Text>

        {/* Section 2: Claims table */}
        {data.claims.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>CLAIMS</Text>
            <View style={pdfStyles.tableHeader}>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellClaim]}>CLAIM</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellConf]}>CONF</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellCit]}>CIT</Text>
            </View>
            {data.claims.map((claim, i) => (
              <View key={i} style={pdfStyles.tableRow}>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellClaim]}>
                  {claim.text.slice(0, 180)}
                </Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellConf]}>
                  {Math.round(claim.confidence * 100)}%
                </Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellCit]}>
                  [{claim.citations.map((_, ci) => ci + 1).join(",")}]
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Section 3: Evidence table */}
        {data.evidence.vector_hits.length > 0 && (
          <>
            <Text style={pdfStyles.sectionTitle}>EVIDENCE</Text>
            <View style={pdfStyles.tableHeader}>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellSource]}>SOURCE</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellExcerpt]}>EXCERPT</Text>
              <Text style={[pdfStyles.tableCell, pdfStyles.cellScore]}>SCORE</Text>
            </View>
            {data.evidence.vector_hits.slice(0, 10).map((hit, i) => (
              <View key={i} style={pdfStyles.tableRow}>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellSource]}>
                  {hit.incident_id.slice(0, 20)}
                </Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellExcerpt]}>
                  {hit.excerpt.slice(0, 200)}
                </Text>
                <Text style={[pdfStyles.tableCell, pdfStyles.cellScore]}>
                  {hit.score.toFixed(3)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>
            Generated by NextAgentAI | run_id: {data.run_id}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  runData: QueryResponse;
}

export default function ExportModal({ open, onClose, runData }: ExportModalProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const handlePdfExport = useCallback(async () => {
    setIsPdfLoading(true);
    try {
      const blob = await pdf(<ExportPdfDocument data={runData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run_${runData.run_id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setIsPdfLoading(false);
    }
  }, [runData]);

  const handleJsonExport = useCallback(() => {
    const json = JSON.stringify(runData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run_${runData.run_id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [runData]);

  if (!open) return null;

  return (
    /* Overlay */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "hsl(216 40% 3% / 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "360px",
          backgroundColor: "hsl(var(--bg-surface))",
          border: "1px solid hsl(var(--border-strong))",
          borderTop: "2px solid hsl(var(--col-cyan))",
          borderRadius: "2px",
          boxShadow: "0 16px 48px hsl(216 40% 3% / 0.8)",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid hsl(var(--border-base))",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <Download size={13} style={{ color: "hsl(var(--col-cyan))" }} />
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: "hsl(var(--text-secondary))",
            }}>
              EXPORT RESULT
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export modal"
            style={{
              background: "transparent",
              border: "1px solid hsl(var(--border-base))",
              borderRadius: "2px",
              cursor: "pointer",
              color: "hsl(var(--text-dim))",
              padding: "3px",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--col-red))";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-red) / 0.5)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(var(--text-dim))";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--border-base))";
            }}
          >
            <X size={11} />
          </button>
        </div>

        {/* Query preview */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid hsl(var(--border-base))" }}>
          <p style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: "hsl(var(--text-dim))",
            lineHeight: "1.4",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}>
            {runData.query}
          </p>
          <p style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            color: "hsl(var(--text-dim))",
            marginTop: "4px",
            opacity: 0.6,
          }}>
            {runData.claims.length} claims · {runData.evidence.vector_hits.length} evidence chunks
          </p>
        </div>

        {/* Export options */}
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* PDF export */}
          <button
            onClick={() => void handlePdfExport()}
            disabled={isPdfLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              backgroundColor: isPdfLoading ? "hsl(var(--bg-elevated))" : "hsl(var(--col-red) / 0.08)",
              border: "1px solid hsl(var(--col-red) / 0.35)",
              borderRadius: "2px",
              cursor: isPdfLoading ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (!isPdfLoading) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-red) / 0.14)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-red) / 0.6)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isPdfLoading) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-red) / 0.08)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-red) / 0.35)";
              }
            }}
          >
            {isPdfLoading
              ? <Loader2 size={14} style={{ color: "hsl(var(--col-red))", animation: "spin 1s linear infinite", flexShrink: 0 }} />
              : <FileText size={14} style={{ color: "hsl(var(--col-red))", flexShrink: 0 }} />
            }
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-red))", marginBottom: "2px" }}>
                {isPdfLoading ? "GENERATING PDF…" : "EXPORT AS PDF"}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "hsl(var(--text-dim))" }}>
                Answer · Claims · Evidence · run_id
              </p>
            </div>
          </button>

          {/* JSON export */}
          <button
            onClick={handleJsonExport}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              backgroundColor: "hsl(var(--col-cyan) / 0.08)",
              border: "1px solid hsl(var(--col-cyan) / 0.35)",
              borderRadius: "2px",
              cursor: "pointer",
              transition: "all 0.15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-cyan) / 0.14)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-cyan) / 0.6)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "hsl(var(--col-cyan) / 0.08)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(var(--col-cyan) / 0.35)";
            }}
          >
            <FileJson size={14} style={{ color: "hsl(var(--col-cyan))", flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: "hsl(var(--col-cyan))", marginBottom: "2px" }}>
                EXPORT AS JSON
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "hsl(var(--text-dim))" }}>
                Full QueryResponse · run_{"<id>"}.json
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
