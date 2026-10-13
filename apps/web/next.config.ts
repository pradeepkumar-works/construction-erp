import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erp/shared'],
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }] },
};

export default nextConfig;
