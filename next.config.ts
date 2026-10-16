import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com https://graph.facebook.com",
      "frame-src https://www.facebook.com https://web.facebook.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  deploymentId: process.env.DEPLOYMENT_VERSION,
  poweredByHeader: false,
  // Dev only: lets a phone test through a temporary tunnel (e.g. DEV_TUNNEL_HOST=abc.trycloudflare.com).
  allowedDevOrigins: process.env.DEV_TUNNEL_HOST ? [process.env.DEV_TUNNEL_HOST] : undefined,
  compress: true,
  serverExternalPackages: ["@whiskeysockets/baileys", "qrcode"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.wazap.lt" }],
        destination: "https://wazap.lt/:path*",
        permanent: true,
      },
      {
        source: "/faq",
        destination: "/#faq",
        permanent: true,
      },
      {
        source: "/whatsapp-team-inbox",
        destination: "/",
        permanent: true,
      },
      {
        source: "/whatsapp-ai-agent",
        destination: "/whatsapp-website-widget",
        permanent: true,
      },
      {
        source: "/ai-agents",
        destination: "/whatsapp-website-widget",
        permanent: true,
      },
      {
        source: "/whatsapp-crm",
        destination: "/whatsapp-lead-routing",
        permanent: true,
      },
      {
        source: "/marketplace/:path*",
        destination: "/whatsapp-ad-tracking",
        permanent: true,
      },
      {
        source: "/integrations",
        destination: "/whatsapp-ad-tracking",
        permanent: true,
      },
      {
        source: "/whatsapp-business-platform",
        destination: "/whatsapp-lead-routing",
        permanent: true,
      },
      {
        source: "/shopify",
        destination: "/whatsapp-ad-tracking",
        permanent: true,
      },
      {
        source: "/flow",
        destination: "/whatsapp-lead-routing",
        permanent: true,
      },
      {
        source: "/whatsapp",
        destination: "/whatsapp-lead-routing",
        permanent: true,
      },
      {
        source: "/guides/router-vs-shared-inbox",
        destination: "/",
        permanent: true,
      },
      {
        source: "/tools/follow-up",
        destination: "/tools/rotator",
        permanent: true,
      },
      {
        source: "/tools/reply-generator",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/message-scheduler",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/formatter",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/bulk",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/checker",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/vcard",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/transcript",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/templates",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/catalog",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/chat-insights",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/tools/linktree",
        destination: "/tools",
        permanent: true,
      },
      {
        source: "/c/:slug*",
        destination: "/",
        permanent: false,
      },
      {
        source: "/l/:slug*",
        destination: "/",
        permanent: false,
      },
      {
        source: "/p/:path*",
        destination: "/",
        permanent: false,
      },
      {
        source: "/inbox/:path*",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/channels/:path*",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/automations/:path*",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/workspace",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/workspace/:path*",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: [...securityHeaders, { key: "X-Wazap-Release", value: "wazap-crm-growth-20261007-v4" }] },
      {
        source: "/(favicon.ico|manifest.json|og-image.png|apple-touch-icon.png)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      {
        source: "/(login|signup|register|forgot-password|reset-password|dashboard|account|admin)(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
