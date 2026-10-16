import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for early detection of issues
  reactStrictMode: true,

  // Images: allow CDN domain for avatars
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env['STORAGE_CDN_HOSTNAME'] ?? 'cdn.tapsync.app',
        pathname: '/avatars/**',
      },
    ],
  },

  // Experimental: server actions enabled by default in Next 15
  experimental: {},
};

export default nextConfig;
