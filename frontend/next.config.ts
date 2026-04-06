import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress React Flow SSR warnings — the component is client-only
  reactStrictMode: true,
  // Strip console.log/warn/error from production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // Fix Turbopack workspace root detection — repo root has a package-lock.json
  // which causes Turbopack to pick the wrong root and panic on App Router pages.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
