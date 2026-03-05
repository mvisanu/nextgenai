// ============================================================
// page.tsx — Four-panel main layout
// Implements: T-032-F
// Panels: Chat (top-left), Agent Timeline (bottom-left),
//         Graph Viewer (top-right), Citations (bottom-right label area)
// ============================================================

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ChatPanel from "./components/ChatPanel";
import AgentTimeline from "./components/AgentTimeline";
import GraphViewer from "./components/GraphViewer";

export default function Home() {
  return (
    /*
     * Full-viewport grid:
     *   columns: left (2/5) | right (3/5)
     *   rows:    top (3/5)  | bottom (2/5)
     *
     * Grid areas:
     *   chat        → col 1, row 1
     *   timeline    → col 1, row 2
     *   graph       → col 2, row 1–2 (spans both rows)
     */
    <main
      className="h-screen w-screen overflow-hidden p-3 gap-3"
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 3fr",
        gridTemplateRows: "3fr 2fr",
        gridTemplateAreas: `
          "chat  graph"
          "timeline graph"
        `,
      }}
    >
      {/* Chat Panel */}
      <Card
        className="flex flex-col overflow-hidden"
        style={{ gridArea: "chat" }}
      >
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base font-semibold">Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
          <ChatPanel />
        </CardContent>
      </Card>

      {/* Agent Timeline Panel */}
      <Card
        className="flex flex-col overflow-hidden"
        style={{ gridArea: "timeline" }}
      >
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base font-semibold">
            Agent Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-3 pt-0 overflow-hidden">
          <AgentTimeline />
        </CardContent>
      </Card>

      {/* Graph Viewer Panel — spans both rows */}
      <Card
        className="flex flex-col overflow-hidden"
        style={{ gridArea: "graph" }}
      >
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-base font-semibold">Graph Viewer</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <GraphViewer />
        </CardContent>
      </Card>
    </main>
  );
}
