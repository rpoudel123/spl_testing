import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Just ignore all TypeScript errors during build
    ignoreBuildErrors: true
  }
};

export default nextConfig;
