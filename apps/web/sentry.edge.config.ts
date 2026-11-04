import * as Sentry from '@sentry/nextjs';

const dsn = process.env['SENTRY_DSN'];

Sentry.init({
  ...(dsn ? { dsn } : {}),
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
});
