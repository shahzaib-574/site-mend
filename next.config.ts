import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Queue clients rely on Node.js connection and script-loading behavior and
  // must remain server-only native dependencies in Route Handlers.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
