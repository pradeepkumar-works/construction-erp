import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').origin;

/**
 * What the pages may load and who may frame them (finding 5 of the October review). Scripts, styles and fonts come
 * from this site (inline ones too: Next's bootstrap and antd's styles), Google Fonts for printouts, and Razorpay's
 * checkout; data from the API, Razorpay and Vercel Blob uploads; files and photos from the API or any HTTPS store.
 * No page may be framed by another site.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: https: ${apiOrigin}`,
  `media-src 'self' blob: https: ${apiOrigin}`,
  `connect-src 'self' ${apiOrigin} https://*.razorpay.com https://vercel.com https://*.vercel-storage.com${dev ? ' ws: wss:' : ''}`,
  `frame-src 'self' blob: ${apiOrigin} https://*.razorpay.com https://*.vercel-storage.com`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erp/shared'],
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
