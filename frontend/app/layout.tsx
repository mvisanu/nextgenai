import type { Metadata } from "next";
import "./globals.css";
import { RunProvider } from "./lib/context";

export const metadata: Metadata = {
  title: "NextAgentAI — Agentic Manufacturing Intelligence",
  description:
    "Ask manufacturing and maintenance questions answered by vector search, GraphRAG, and SQL tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <RunProvider>{children}</RunProvider>
      </body>
    </html>
  );
}
