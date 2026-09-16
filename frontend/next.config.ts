import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for multi-stage Docker build (copies only what's needed to run)
  output: "standalone",

  // Allow YouTube thumbnail images to be served
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
  },
};

export default nextConfig;
