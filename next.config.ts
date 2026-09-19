import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * `connect-src` must allow `*.r2.cloudflarestorage.com` because large uploads are
 * sent from the browser straight to R2 through pre-signed URLs (multipart upload),
 * which keeps big files out of the application runtime entirely.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data: https://*.r2.cloudflarestorage.com https://*.r2.dev https://api.cloudflare.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Preview/sandbox hosts used while developing (the app accepts any origin in
  // production; this only silences Next's cross-origin dev warning).
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai"],
  poweredByHeader: false,
  compress: true,
  typescript: {
    // Type errors must never silently ship to production.
    ignoreBuildErrors: false,
  },
  experimental: {
    // Large multipart uploads are streamed directly to R2, but the request body
    // limit still applies to small single-shot uploads proxied by the app.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/((?!download|api/d).*)",
        headers: securityHeaders,
      },
      {
        source: "/download/:path*",
        headers: [
          ...securityHeaders.filter((header) => header.key !== "Cross-Origin-Resource-Policy"),
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Accept-Ranges", value: "bytes" },
          { key: "Cache-Control", value: "private, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
