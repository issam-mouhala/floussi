import type { NextConfig } from "next";

// "standalone" is for self-hosting (bun run start / Docker).
// On Vercel the platform builds and serves the app itself — standard output
// is the supported mode there and avoids deployment issues.
const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  output: isVercel ? undefined : "standalone",
  // Keep Prisma + libSQL out of the bundler: their native engines/binaries
  // must ship as real files for Vercel serverless to load them.
  serverExternalPackages: ["@prisma/client", "@libsql/client", "libsql"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
