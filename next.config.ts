import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Netlify supplies COMMIT_REF during builds. This public value contains no
    // secret and lets opt-in browser diagnostics identify the deployed code.
    NEXT_PUBLIC_QURAN_BUILD_COMMIT: process.env.COMMIT_REF ?? process.env.NEXT_PUBLIC_QURAN_BUILD_COMMIT ?? "local-development",
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};

export default nextConfig;
