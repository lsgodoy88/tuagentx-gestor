import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    viewTransition: true,
    optimizePackageImports: [
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "@anthropic-ai/sdk",
    ],
  },
  async redirects() {
    return [
      { source: '/dashboard', destination: '/inicio', permanent: true },
      { source: '/dashboard/:path*', destination: '/:path*', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // No-store en páginas HTML — previene bfcache con chunks obsoletos post-deploy
        source: "/((?!_next/static|_next/image|favicon.ico|.*\.png$|.*\.jpg$|.*\.svg$|.*\.ico$).*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Headers de seguridad globales
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.anthropic.com https://serviceuptres.cloud https://overpass-api.de https://*.basemaps.cartocdn.com wss:; frame-ancestors 'none'; frame-src https://tuagentx.com;" },
        ],
      },
    ];
  },
};

export default nextConfig;
