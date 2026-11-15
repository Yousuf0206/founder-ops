import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Type errors fail the build. Constitution X: complete, runnable work.
    ignoreBuildErrors: false,
  },

  /**
   * 6.0.0-subtraction merged /hurdles and /pack into /results. Both were
   * primary destinations for long enough to be bookmarked and linked from
   * emails, so they keep working — permanently, because the merge is not
   * coming back. Everything in the app links to /results directly; these
   * exist only for links made before the merge.
   */
  async redirects() {
    return [
      { source: "/hurdles", destination: "/results", permanent: true },
      { source: "/pack", destination: "/results", permanent: true },
    ];
  },
};

export default nextConfig;
