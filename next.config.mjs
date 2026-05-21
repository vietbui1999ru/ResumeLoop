/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  env: {
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_MODE: process.env.APP_MODE ?? "local",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires unsafe-inline for hydration scripts; unsafe-eval for dev HMR
              // jsdelivr.net is required by @monaco-editor/react for the Monaco loader
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://giscus.app",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https:",
              // LLM API calls are server-side; connect-src covers browser fetch to /api/*
              "connect-src 'self'",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
              // blob: needed for PDF iframe (PdfViewer creates a blob URL from server-fetched PDF)
              "frame-src 'self' blob: https://giscus.app",
              // Monaco editor spins up web workers via blob: URLs
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
