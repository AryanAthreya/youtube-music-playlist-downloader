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
  // Proxy /api calls to FastAPI backend container
  async rewrites() {
    const backendUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
