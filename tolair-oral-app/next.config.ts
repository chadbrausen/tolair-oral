import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Environment variables for production
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://tolair-oral-api.azurewebsites.net",
  },
};

export default nextConfig;
