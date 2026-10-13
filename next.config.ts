import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    output: development ? undefined : "export",
    distDir: development ? ".next-dev" : ".next",
    images: { unoptimized: true },
    experimental: { agentFeedback: true },
    ...(development
      ? {
          async rewrites() {
            return [
              {
                source: "/api/:path*",
                destination: "http://127.0.0.1:8787/api/:path*",
              },
            ];
          },
        }
      : {}),
  };
}
