import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress React Flow SSR warnings — the component is client-only
  reactStrictMode: true,
  // Fix Turbopack workspace root detection — repo root has a package-lock.json
  // which causes Turbopack to pick the wrong root and panic on App Router pages.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
