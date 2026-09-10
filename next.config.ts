import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Type errors fail the build. Constitution X: complete, runnable work.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
