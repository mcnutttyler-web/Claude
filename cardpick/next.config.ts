import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      // Real TCGplayer exports run to tens of thousands of rows.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
