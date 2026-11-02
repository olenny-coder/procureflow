import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local"), override: true });

// Auth.js v4 uses NEXTAUTH_* names; the project's canonical names are AUTH_*.
// Render provides RENDER_EXTERNAL_URL automatically, so managed deployments do
// not need to hardcode the public URL.
process.env.NEXTAUTH_SECRET ||= process.env.AUTH_SECRET;
process.env.NEXTAUTH_URL ||= process.env.AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
process.env.AUTH_URL ||= process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@procureflow/shared", "@procureflow/db", "@procureflow/workflows"],
  experimental: {
    serverComponentsExternalPackages: ["postgres", "bcryptjs"],
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
