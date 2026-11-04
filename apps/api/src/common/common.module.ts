import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { HttpExceptionFilter } from './filters/http-exception.filter.js';

/**
 * CommonModule
 *
 * Registered once in {@link AppModule}. Sets up:
 *
 * 1. **Global exception filter** – normalises every error to
 *    `{ statusCode, code, message, details? }`.
 *
 * 2. **Rate limiting** via `@nestjs/throttler`:
 *    - `default` – 60 requests / 60 s (general API).
 *    - `strict`  – 10 requests / 60 s (used by /auth/* and /public/events).
 *
 *    Throttler-aware guards on individual controllers/routes can pick the
 *    `strict` named throttler with `@Throttle({ strict: { … } })` or the
 *    `@SkipThrottle()` decorator.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,  // 60 s in ms
        limit: 60,
      },
      {
        name: 'strict',
        ttl: 60_000,  // 60 s in ms
        limit: 10,
      },
    ]),
  ],
  providers: [
    // Apply the exception filter to every route in the application
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Apply the throttler guard to every route in the application.
    // Individual controllers/routes can override limits or skip entirely.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [ThrottlerModule],
})
export class CommonModule {}
