import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env['SENTRY_DSN'];

Sentry.init({
  ...(dsn ? { dsn } : {}),
  environment: process.env['NODE_ENV'] ?? 'development',
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 1.0,
  integrations: [nodeProfilingIntegration()],
  enabled: Boolean(dsn),
});
