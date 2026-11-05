import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';

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

  // Force single React instance to prevent "useContext null" errors
  // when multiple packages resolve different React copies.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  ...(process.env['SENTRY_ORG'] ? { org: process.env['SENTRY_ORG'] } : {}),
  ...(process.env['SENTRY_PROJECT']
    ? { project: process.env['SENTRY_PROJECT'] }
    : {}),
});
