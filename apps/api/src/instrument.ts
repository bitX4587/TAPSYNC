import * as Sentry from '@sentry/nestjs';

const dsn = process.env['SENTRY_DSN'];

Sentry.init({
  ...(dsn ? { dsn } : {}),
  environment: process.env['NODE_ENV'] ?? 'development',
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
  enabled: Boolean(dsn),
});