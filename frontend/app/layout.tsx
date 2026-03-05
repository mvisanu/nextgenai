import type { Metadata } from "next";
import { Orbitron, Rajdhani, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RunProvider } from "./lib/context";
import { ThemeProvider } from "./lib/theme";
import { DomainProvider } from "./lib/domain-context";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-display",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextAgentAI — Agentic Manufacturing Intelligence",
  description:
    "Ask manufacturing and maintenance questions answered by vector search, GraphRAG, and SQL tools.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark text-medium ${orbitron.variable} ${rajdhani.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Anti-flash: apply saved theme class before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(t);var f=localStorage.getItem('fontSize')||'medium';document.documentElement.classList.remove('text-small','text-medium','text-large');document.documentElement.classList.add('text-'+f);}catch(e){}`,
          }}
        />
      </head>
      <body
        className="min-h-screen bg-background antialiased"
        style={{ fontFamily: "var(--font-body, sans-serif)" }}
      >
        <ThemeProvider>
          <DomainProvider>
            <RunProvider>{children}</RunProvider>
          </DomainProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
