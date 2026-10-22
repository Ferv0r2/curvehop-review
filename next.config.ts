import type { NextConfig } from "next";
// Review-only environment. No indexing, remote images, telemetry, or deployment binding.
const config: NextConfig = {
  async redirects() { return [{ source: "/", destination: "/discover", permanent: true }]; },
  async headers() { return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]; },
  htmlLimitedBots: /.*/,
};
export default config;
