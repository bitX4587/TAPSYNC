import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import { validate } from './env.validation.js';

/**
 * Global config module – imported once in {@link AppModule}.
 *
 * - Loads `.env` when not in production (via `dotenv`).
 * - Validates all environment variables at startup; the process exits
 *   immediately on any missing or malformed value (fail-fast).
 * - Exports {@link AppConfigService} so every module can inject it without
 *   re-importing this module.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate,
    }),
  ],
  providers: [AppConfigService, ConfigService],
  exports: [AppConfigService, ConfigService],
})
export class AppConfigModule {}
