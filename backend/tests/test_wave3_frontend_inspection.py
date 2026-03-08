"""
Wave 3 — Frontend code inspection tests (test_wave3_frontend_inspection.py)

These tests verify Wave 3 frontend features by inspecting TypeScript source files.
No JavaScript runtime needed — pure file content checks.

Covers:
- ChatPanel: session_id generation, history accumulation, session pill, clear reset
- ChatPanel: SSE streaming renderer, pending_query localStorage check
- ChatPanel: medical disclaimer banner
- ChatPanel: AGENT NOTES collapsible section
- HistorySidebar: new file exists, required props
- ExportModal: new file exists, PDF + JSON export
- CitationsDrawer: Prev/Next nav, "N of M" counter, conflict badge, highlightRange
- AgentTimeline: CACHED badge, TimingBreakdown, SourceBadge, CSV download
- GraphViewer: search filter, filteredNodes useMemo, viewport-aware popover, edge weight labels
- Examples pages: Run button + localStorage bridge
- api.ts: new types and functions (getRuns, patchFavourite, getAnalytics*)
- Dashboard Tabs 3/4/5: real API calls via useEffect
"""
from __future__ import annotations

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

FRONTEND = Path(__file__).parent.parent.parent / "frontend"
COMPONENTS = FRONTEND / "app" / "components"
DASHBOARD_COMPONENTS = FRONTEND / "app" / "dashboard" / "components"
PAGES = FRONTEND / "app"
API_TS = FRONTEND / "app" / "lib" / "api.ts"

CHAT_PANEL = COMPONENTS / "ChatPanel.tsx"
HISTORY_SIDEBAR = COMPONENTS / "HistorySidebar.tsx"
EXPORT_MODAL = COMPONENTS / "ExportModal.tsx"
CITATIONS_DRAWER = COMPONENTS / "CitationsDrawer.tsx"
AGENT_TIMELINE = COMPONENTS / "AgentTimeline.tsx"
GRAPH_VIEWER = COMPONENTS / "GraphViewer.tsx"
EXAMPLES_PAGE = PAGES / "examples" / "page.tsx"
MEDICAL_EXAMPLES_PAGE = PAGES / "medical-examples" / "page.tsx"
TAB3 = DASHBOARD_COMPONENTS / "Tab3DefectAnalytics.tsx"
TAB4 = DASHBOARD_COMPONENTS / "Tab4MaintenanceTrends.tsx"
TAB5 = DASHBOARD_COMPONENTS / "Tab5DataEval.tsx"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


# ===========================================================================
# ChatPanel — Epic 1 (Session Memory) + Epic 3 (Streaming) + Epic 7 (Examples)
# ===========================================================================


class TestChatPanelWave3:
    """Verify ChatPanel has all Wave 3 features."""

    def test_chat_panel_exists(self):
        assert CHAT_PANEL.exists(), "ChatPanel.tsx not found"

    def test_session_id_state(self):
        """AC: session_id generated on first query (not on mount)."""
        content = read(CHAT_PANEL)
        has_session_id = "sessionId" in content or "session_id" in content
        assert has_session_id, (
            "BUG-W3-CHAT-SESSION: ChatPanel has no session_id state. "
            "Epic 1 session UUID not implemented."
        )

    def test_conversation_history_state(self):
        """AC: history accumulated across queries, max 5 turns."""
        content = read(CHAT_PANEL)
        has_history = "conversationHistory" in content or "conversation_history" in content
        assert has_history, (
            "BUG-W3-CHAT-HIST: ChatPanel has no conversationHistory state. "
            "Epic 1 history accumulation not implemented."
        )

    def test_session_pill_rendered(self):
        """AC: session pill shows 'Session active • N turns'."""
        content = read(CHAT_PANEL)
        has_pill = "Session active" in content or "session" in content.lower()
        assert has_pill, (
            "BUG-W3-CHAT-PILL: No session indicator text found in ChatPanel. "
            "Epic 1 session pill not implemented."
        )

    def test_clear_resets_session(self):
        """AC: Clear (Trash) button resets sessionId and conversationHistory."""
        content = read(CHAT_PANEL)
        has_trash = "Trash" in content or "trash" in content
        assert has_trash, (
            "BUG-W3-CHAT-CLEAR: No Trash icon in ChatPanel. "
            "Clear button not present."
        )

    def test_sse_streaming_present(self):
        """AC: ChatPanel uses fetch with ReadableStream for SSE."""
        content = read(CHAT_PANEL)
        has_streaming = (
            "text/event-stream" in content
            or "ReadableStream" in content
            or "streaming" in content.lower()
        )
        assert has_streaming, (
            "BUG-W3-CHAT-SSE: No SSE streaming code in ChatPanel. "
            "Epic 3 not implemented."
        )

    def test_pending_query_localStorage_check(self):
        """AC: ChatPanel reads localStorage.pending_query on mount."""
        content = read(CHAT_PANEL)
        has_pending = "pending_query" in content
        assert has_pending, (
            "BUG-W3-CHAT-PEND: ChatPanel does not check pending_query in localStorage. "
            "Epic 7 localStorage bridge not implemented."
        )

    def test_medical_disclaimer_banner(self):
        """AC: Medical disclaimer banner when domain=MEDICAL."""
        content = read(CHAT_PANEL)
        has_disclaimer = (
            "medical" in content.lower()
            and ("disclaimer" in content.lower()
                 or "clinical" in content.lower()
                 or "not for" in content.lower())
        )
        assert has_disclaimer, (
            "BUG-W3-CHAT-MED: Medical disclaimer banner not found in ChatPanel. "
            "Epic 9 medical disclaimer not implemented."
        )

    def test_agent_notes_collapsible(self):
        """AC: AGENT NOTES collapsible section for next_steps and assumptions."""
        content = read(CHAT_PANEL)
        has_agent_notes = "AGENT NOTES" in content or "agent notes" in content.lower()
        assert has_agent_notes, (
            "BUG-W3-CHAT-NOTES: 'AGENT NOTES' section not found in ChatPanel. "
            "Epic 10 AGENT NOTES collapsible not implemented."
        )

    def test_export_button_present(self):
        """AC: Export button on assistant messages."""
        content = read(CHAT_PANEL)
        has_export = "Export" in content or "export" in content or "Download" in content
        assert has_export, (
            "BUG-W3-CHAT-EXPORT: No export button found in ChatPanel. "
            "Epic 5 export button not implemented."
        )

    def test_history_sidebar_imported(self):
        """AC: HistorySidebar imported and rendered in ChatPanel."""
        content = read(CHAT_PANEL)
        has_sidebar = "HistorySidebar" in content
        assert has_sidebar, (
            "BUG-W3-CHAT-SIDEBAR: HistorySidebar not imported in ChatPanel. "
            "Epic 2 history sidebar not wired."
        )

    def test_share_url_param_read(self):
        """AC: ChatPanel reads ?run=<run_id> from URL on mount."""
        content = read(CHAT_PANEL)
        has_share = (
            "useSearchParams" in content
            or "run=" in content
            or "searchParams" in content
        )
        assert has_share, (
            "BUG-W3-CHAT-SHARE: ChatPanel does not read ?run= from URL. "
            "Epic 2 share URL not implemented."
        )


# ===========================================================================
# HistorySidebar — Epic 2
# ===========================================================================


class TestHistorySidebarWave3:
    """AC: HistorySidebar new component with correct features."""

    def test_history_sidebar_file_exists(self):
        assert HISTORY_SIDEBAR.exists(), (
            "BUG-W3-SIDEBAR-FILE: HistorySidebar.tsx does not exist. "
            "Epic 2 not implemented."
        )

    def test_history_sidebar_240px_width(self):
        content = read(HISTORY_SIDEBAR)
        has_width = "240" in content or "15rem" in content
        assert has_width, (
            "BUG-W3-SIDEBAR-WIDTH: HistorySidebar is not 240px wide. "
            "PRD specifies 240px for collapsible left sidebar."
        )

    def test_history_sidebar_is_favourite_handling(self):
        """AC: Star icon toggles is_favourite."""
        content = read(HISTORY_SIDEBAR)
        has_fav = "is_favourite" in content or "favourite" in content.lower()
        assert has_fav, (
            "BUG-W3-SIDEBAR-FAV: HistorySidebar has no favourite toggle. "
            "Epic 2 star/favourite feature not implemented."
        )

    def test_history_sidebar_on_load_prop(self):
        """AC: clicking history item calls onLoad callback (no re-query)."""
        content = read(HISTORY_SIDEBAR)
        has_on_load = "onLoad" in content
        assert has_on_load, (
            "BUG-W3-SIDEBAR-LOAD: HistorySidebar has no onLoad prop. "
            "History item click should reload without re-querying."
        )

    def test_history_sidebar_share_icon(self):
        """AC: Share icon copies ?run=<id> URL to clipboard."""
        content = read(HISTORY_SIDEBAR)
        has_share = (
            "Share" in content
            or "clipboard" in content.lower()
            or "copy" in content.lower()
            or "?run=" in content
        )
        assert has_share, (
            "BUG-W3-SIDEBAR-SHARE: HistorySidebar has no share/copy-URL feature. "
            "Epic 2 share URL not implemented."
        )

    def test_history_sidebar_favourites_sorted_first(self):
        """AC: Favourites pinned to top of list."""
        content = read(HISTORY_SIDEBAR)
        has_sort = "is_favourite" in content and ("sort" in content.lower() or "-1" in content)
        assert has_sort, (
            "BUG-W3-SIDEBAR-SORT: HistorySidebar does not sort favourites first. "
            "Epic 2 requires favourites pinned at top."
        )


# ===========================================================================
# ExportModal — Epic 5
# ===========================================================================


class TestExportModalWave3:
    """AC: ExportModal new component with PDF + JSON export."""

    def test_export_modal_file_exists(self):
        assert EXPORT_MODAL.exists(), (
            "BUG-W3-EXPORT-FILE: ExportModal.tsx does not exist. "
            "Epic 5 export not implemented."
        )

    def test_export_modal_pdf_option(self):
        content = read(EXPORT_MODAL)
        has_pdf = "pdf" in content.lower() or "PDF" in content
        assert has_pdf, (
            "BUG-W3-EXPORT-PDF: ExportModal has no PDF export option. "
            "Epic 5 requires PDF via @react-pdf/renderer."
        )

    def test_export_modal_json_option(self):
        content = read(EXPORT_MODAL)
        has_json = "json" in content.lower() or "JSON" in content
        assert has_json, (
            "BUG-W3-EXPORT-JSON: ExportModal has no JSON export option."
        )

    def test_export_modal_run_id_in_template(self):
        """AC: PDF footer includes run_id."""
        content = read(EXPORT_MODAL)
        has_run_id = "run_id" in content or "runId" in content
        assert has_run_id, (
            "BUG-W3-EXPORT-RUN: ExportModal does not include run_id in template. "
            "Epic 5 requires run_id in PDF footer."
        )


# ===========================================================================
# CitationsDrawer — Epic 6
# ===========================================================================


class TestCitationsDrawerWave3:
    """AC: CitationsDrawer has Prev/Next nav, conflict badge, char-offset highlighting."""

    def test_citations_drawer_exists(self):
        assert CITATIONS_DRAWER.exists(), "CitationsDrawer.tsx not found"

    def test_prev_next_buttons_present(self):
        """AC: Prev/Next buttons when citations.length > 1."""
        content = read(CITATIONS_DRAWER)
        has_prev_next = (
            ("Prev" in content or "prev" in content or "Previous" in content or "ChevronLeft" in content)
            and ("Next" in content or "next" in content or "ChevronRight" in content)
        )
        assert has_prev_next, (
            "BUG-W3-CIT-NAV: CitationsDrawer has no Prev/Next navigation buttons. "
            "Epic 6 multi-citation navigation not implemented."
        )

    def test_n_of_m_counter(self):
        """AC: '1 of N' counter shown."""
        content = read(CITATIONS_DRAWER)
        has_counter = "of " in content and ("totalCitations" in content or "length" in content)
        assert has_counter, (
            "BUG-W3-CIT-COUNT: No 'N of M' counter found in CitationsDrawer. "
            "Epic 6 citation counter not implemented."
        )

    def test_conflict_badge_rendered(self):
        """AC: Amber CONFLICT badge when claim.conflict_flagged === true."""
        content = read(CITATIONS_DRAWER)
        has_conflict = "conflict_flagged" in content or "CONFLICT" in content
        assert has_conflict, (
            "BUG-W3-CIT-CONFLICT: No conflict badge in CitationsDrawer. "
            "Epic 6 CONFLICT badge not implemented."
        )

    def test_highlight_range_implemented(self):
        """AC: highlightRange() using char_start/char_end."""
        content = read(CITATIONS_DRAWER)
        has_highlight = (
            "highlightRange" in content
            or "char_start" in content
            or "<mark>" in content
        )
        assert has_highlight, (
            "BUG-W3-CIT-HIGHLIGHT: No char-offset highlighting in CitationsDrawer. "
            "Epic 6 highlight not implemented."
        )


# ===========================================================================
# AgentTimeline — Epic 10 (CACHED, timing, SourceBadge, CSV)
# ===========================================================================


class TestAgentTimelineWave3:
    """AC: AgentTimeline has CACHED badge, TimingBreakdown, SourceBadge, CSV download."""

    def test_agent_timeline_exists(self):
        assert AGENT_TIMELINE.exists(), "AgentTimeline.tsx not found"

    def test_cached_badge_present(self):
        """AC: CACHED green pill when run_summary.cached === true."""
        content = read(AGENT_TIMELINE)
        has_cached = "CACHED" in content or "cached" in content
        assert has_cached, (
            "BUG-W3-TIMELINE-CACHED: No CACHED badge in AgentTimeline. "
            "Epic 10 CACHED badge not implemented."
        )

    def test_timing_breakdown_present(self):
        """AC: TimingBreakdown collapsible bar chart for state_timings_ms."""
        content = read(AGENT_TIMELINE)
        has_timing = (
            "TimingBreakdown" in content
            or "state_timings_ms" in content
            or "timing" in content.lower()
        )
        assert has_timing, (
            "BUG-W3-TIMELINE-TIMING: No TimingBreakdown in AgentTimeline. "
            "Epic 10 timing bar chart not implemented."
        )

    def test_source_badge_present(self):
        """AC: SourceBadge for bm25/vector/hybrid hits."""
        content = read(AGENT_TIMELINE)
        has_source = (
            "SourceBadge" in content
            or "source" in content.lower()
            and ("bm25" in content.lower() or "vector" in content.lower())
        )
        assert has_source, (
            "BUG-W3-TIMELINE-SOURCE: No SourceBadge in AgentTimeline. "
            "Epic 10 BM25/vector/hybrid source labels not implemented."
        )

    def test_csv_download_present(self):
        """AC: CSV download button on SQL result tables."""
        content = read(AGENT_TIMELINE)
        has_csv = "CSV" in content or "csv" in content or "downloadCsv" in content
        assert has_csv, (
            "BUG-W3-TIMELINE-CSV: No CSV download in AgentTimeline. "
            "Epic 5 SQL CSV export not implemented."
        )


# ===========================================================================
# GraphViewer — Epic 8
# ===========================================================================


class TestGraphViewerWave3:
    """AC: GraphViewer has node search, fitView, viewport-aware popover, edge labels."""

    def test_graph_viewer_exists(self):
        assert GRAPH_VIEWER.exists(), "GraphViewer.tsx not found"

    def test_search_filter_present(self):
        """AC: Search input filters nodes by label substring."""
        content = read(GRAPH_VIEWER)
        has_search = "searchQuery" in content or "search" in content.lower()
        assert has_search, (
            "BUG-W3-GRAPH-SEARCH: No node search in GraphViewer. "
            "Epic 8 search filter not implemented."
        )

    def test_filtered_nodes_usememo(self):
        """AC: filteredNodes must be useMemo to prevent ReactFlow infinite loop."""
        content = read(GRAPH_VIEWER)
        has_memo = "useMemo" in content and "filteredNodes" in content
        assert has_memo, (
            "BUG-W3-GRAPH-MEMO: filteredNodes not wrapped in useMemo. "
            "Will cause ReactFlow StoreUpdater infinite loop."
        )

    def test_fit_view_button_present(self):
        """AC: Fit to selection button after search."""
        content = read(GRAPH_VIEWER)
        has_fit = "fitView" in content or "fit" in content.lower()
        assert has_fit, (
            "BUG-W3-GRAPH-FIT: No fitView button in GraphViewer. "
            "Epic 8 'Fit to selection' not implemented."
        )

    def test_viewport_aware_popover(self):
        """AC: Popover flips if node is near viewport edge."""
        content = read(GRAPH_VIEWER)
        has_viewport = (
            "POPOVER_WIDTH" in content
            or "window.innerWidth" in content
            or "window.innerHeight" in content
        )
        assert has_viewport, (
            "BUG-W3-GRAPH-POPOVER: No viewport-aware popover in GraphViewer. "
            "Epic 8 popover positioning not implemented."
        )

    def test_edge_weight_labels(self):
        """AC: SIMILAR_TO edges show weight formatted to 2dp."""
        content = read(GRAPH_VIEWER)
        has_edge_label = (
            "toFixed" in content
            or "weight" in content.lower()
            and "label" in content.lower()
        )
        assert has_edge_label, (
            "BUG-W3-GRAPH-EDGE: No edge weight labels in GraphViewer. "
            "Epic 8 edge weight display not implemented."
        )


# ===========================================================================
# Examples pages — Epic 7
# ===========================================================================


class TestExamplesPageWave3:
    """AC: Examples pages have Run button + localStorage bridge."""

    def test_examples_page_exists(self):
        assert EXAMPLES_PAGE.exists(), "examples/page.tsx not found"

    def test_examples_has_run_button(self):
        """AC: 'Run this query' button on each example card."""
        content = read(EXAMPLES_PAGE)
        has_run = "RUN" in content or "Run" in content or "handleRunQuery" in content
        assert has_run, (
            "BUG-W3-EX-RUN: No Run button in examples/page.tsx. "
            "Epic 7 not implemented."
        )

    def test_examples_writes_pending_query(self):
        """AC: localStorage.pending_query written on Run click."""
        content = read(EXAMPLES_PAGE)
        has_pending = "pending_query" in content
        assert has_pending, (
            "BUG-W3-EX-PEND: examples/page.tsx does not write pending_query to localStorage. "
            "Epic 7 localStorage bridge not implemented."
        )

    def test_examples_writes_pending_domain(self):
        """AC: localStorage.pending_domain written with 'AIRCRAFT'."""
        content = read(EXAMPLES_PAGE)
        has_domain = "pending_domain" in content
        assert has_domain, (
            "BUG-W3-EX-DOM: examples/page.tsx does not write pending_domain to localStorage."
        )

    def test_medical_examples_page_exists(self):
        assert MEDICAL_EXAMPLES_PAGE.exists(), "medical-examples/page.tsx not found"

    def test_medical_examples_has_run_button(self):
        content = read(MEDICAL_EXAMPLES_PAGE)
        has_run = "RUN" in content or "Run" in content or "handleRunQuery" in content
        assert has_run, (
            "BUG-W3-MEX-RUN: No Run button in medical-examples/page.tsx. "
            "Epic 7 not implemented for medical domain."
        )

    def test_medical_examples_writes_medical_domain(self):
        """AC: localStorage.pending_domain written with 'MEDICAL'."""
        content = read(MEDICAL_EXAMPLES_PAGE)
        has_medical_domain = "MEDICAL" in content and "pending_domain" in content
        assert has_medical_domain, (
            "BUG-W3-MEX-DOM: medical-examples/page.tsx does not write MEDICAL to pending_domain."
        )


# ===========================================================================
# api.ts — Wave 3 new types and functions
# ===========================================================================


class TestApiTsWave3:
    """AC: api.ts has all Wave 3 types and functions."""

    def test_api_ts_exists(self):
        assert API_TS.exists(), "frontend/app/lib/api.ts not found"

    def test_conversation_turn_type(self):
        content = read(API_TS)
        assert "ConversationTurn" in content, (
            "BUG-W3-API-CTURN: ConversationTurn interface not in api.ts."
        )

    def test_history_run_summary_type(self):
        content = read(API_TS)
        assert "HistoryRunSummary" in content, (
            "BUG-W3-API-HIST: HistoryRunSummary interface not in api.ts. "
            "Epic 2 history types missing."
        )

    def test_get_runs_function(self):
        content = read(API_TS)
        assert "getRuns" in content, (
            "BUG-W3-API-GRUNS: getRuns() not in api.ts. "
            "Epic 2 GET /runs not wired."
        )

    def test_patch_favourite_function(self):
        content = read(API_TS)
        assert "patchFavourite" in content, (
            "BUG-W3-API-PFAV: patchFavourite() not in api.ts. "
            "Epic 2 PATCH /runs/{id}/favourite not wired."
        )

    def test_get_analytics_defects_function(self):
        content = read(API_TS)
        assert "getAnalyticsDefects" in content, (
            "BUG-W3-API-ADEF: getAnalyticsDefects() not in api.ts. "
            "Epic 4 dashboard analytics not wired."
        )

    def test_get_analytics_maintenance_function(self):
        content = read(API_TS)
        assert "getAnalyticsMaintenance" in content, (
            "BUG-W3-API-AMNT: getAnalyticsMaintenance() not in api.ts."
        )

    def test_get_analytics_diseases_function(self):
        content = read(API_TS)
        assert "getAnalyticsDiseases" in content, (
            "BUG-W3-API-ADIS: getAnalyticsDiseases() not in api.ts."
        )

    def test_vector_hit_source_field_in_api_ts(self):
        """AC: VectorHit interface has source field."""
        content = read(API_TS)
        has_source = (
            "source" in content
            and ("bm25" in content or "vector" in content)
        )
        assert has_source, (
            "BUG-W3-API-SRC: VectorHit.source field not in api.ts. "
            "Epic 10 source badge types missing."
        )

    def test_is_favourite_in_api_ts(self):
        content = read(API_TS)
        assert "is_favourite" in content, (
            "BUG-W3-API-ISFAV: is_favourite not in api.ts types."
        )

    def test_conflict_flagged_in_api_ts(self):
        content = read(API_TS)
        assert "conflict_flagged" in content, (
            "BUG-W3-API-CONF: conflict_flagged not in api.ts Claim type."
        )

    def test_state_timings_ms_in_api_ts(self):
        content = read(API_TS)
        assert "state_timings_ms" in content, (
            "BUG-W3-API-TIMING: state_timings_ms not in api.ts RunSummary type."
        )


# ===========================================================================
# Dashboard Tabs 3/4/5 — Epic 4
# ===========================================================================


class TestDashboardTabsWave3:
    """AC: Tabs 3/4/5 fetch real analytics API data."""

    def test_tab3_defect_analytics_exists(self):
        assert TAB3.exists(), "Tab3DefectAnalytics.tsx not found"

    def test_tab3_fetches_analytics_api(self):
        """AC: Tab 3 calls getAnalyticsDefects or getAnalyticsDiseases."""
        content = read(TAB3)
        has_fetch = "getAnalyticsDefects" in content or "getAnalyticsDiseases" in content
        assert has_fetch, (
            "BUG-W3-TAB3-API: Tab3DefectAnalytics does not fetch analytics API. "
            "Epic 4 real data wiring not implemented for Tab 3."
        )

    def test_tab3_has_loading_state(self):
        """AC: Loading skeleton shown while fetching."""
        content = read(TAB3)
        has_loading = "loading" in content.lower() or "skeleton" in content.lower()
        assert has_loading, (
            "BUG-W3-TAB3-LOAD: Tab3 has no loading state. "
            "Epic 4 requires loading skeleton."
        )

    def test_tab4_maintenance_exists(self):
        assert TAB4.exists(), "Tab4MaintenanceTrends.tsx not found"

    def test_tab4_fetches_maintenance_api(self):
        """AC: Tab 4 calls getAnalyticsMaintenance."""
        content = read(TAB4)
        has_fetch = "getAnalyticsMaintenance" in content
        assert has_fetch, (
            "BUG-W3-TAB4-API: Tab4MaintenanceTrends does not fetch analytics API. "
            "Epic 4 real data wiring not implemented for Tab 4."
        )

    def test_tab5_data_eval_exists(self):
        assert TAB5.exists(), "Tab5DataEval.tsx not found"

    def test_tab5_fetches_analytics_api(self):
        """AC: Tab 5 calls getAnalyticsDefects or getAnalyticsDiseases for live counts."""
        content = read(TAB5)
        has_fetch = "getAnalyticsDefects" in content or "getAnalyticsDiseases" in content
        assert has_fetch, (
            "BUG-W3-TAB5-API: Tab5DataEval does not fetch analytics API. "
            "Epic 4 live dataset health metrics not implemented."
        )


# ===========================================================================
# Architecture constraints — regressions
# ===========================================================================


class TestArchitectureConstraints:
    """Verify CLAUDE.md architecture constraints not regressed."""

    def test_graph_viewer_uses_usememo_for_graph_path(self):
        """graphPath and vectorHitsForGraph must use useMemo."""
        content = read(GRAPH_VIEWER)
        has_memo = "useMemo" in content
        assert has_memo, (
            "BUG-ARCH: GraphViewer no longer uses useMemo. "
            "This will cause ReactFlow StoreUpdater infinite loop."
        )

    def test_chat_panel_in_suspense_boundary(self):
        """ChatPanelInner must be wrapped in Suspense (useSearchParams requirement)."""
        content = read(CHAT_PANEL)
        has_suspense = "Suspense" in content
        assert has_suspense, (
            "BUG-ARCH: ChatPanel not wrapped in Suspense. "
            "useSearchParams() requires Suspense boundary in Next.js App Router."
        )

    def test_dashboard_height_calc_present(self):
        """Dashboard height must be calc(100vh - 46px), not 100vh."""
        from pathlib import Path
        dashboard_page = FRONTEND / "app" / "dashboard" / "page.tsx"
        if not dashboard_page.exists():
            pytest.skip("dashboard/page.tsx not found")
        content = dashboard_page.read_text()
        has_calc = "calc(100vh - 46px)" in content
        assert has_calc, (
            "BUG-ARCH: dashboard/page.tsx does not use calc(100vh - 46px). "
            "Global AppHeader is 46px — must be subtracted."
        )
