import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress React Flow SSR warnings — the component is client-only
  reactStrictMode: true,
};

export default nextConfig;
