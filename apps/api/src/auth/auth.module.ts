import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../config/index.js';
import { CardsModule } from '../cards/index.js';
import { LinksModule } from '../links/index.js';
import { UsersModule } from '../users/index.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

/**
 * AuthModule
 *
 * Provides authentication flows:
 *  - Anonymous account creation (POST /auth/anonymous) — Req 1.1
 *  - JWT access token strategy + guard (Req 1.2, 1.11, 10.4)
 *  - Refresh, logout, Google link, email link, recovery code — Req 1.2–1.7
 *  - Account restore (POST /auth/restore) — Req 1.8
 *
 * LinksModule and CardsModule are imported so AuthService can inject the
 * ProfileLink and NfcCard models required to check whether a caller's
 * anonymous account is "untouched" before deleting it on restore.
 *
 * JwtModule is registered asynchronously so it can read secrets from the
 * globally-available AppConfigService rather than hard-coding them here.
 * Individual signing calls in AuthService pass the appropriate secret, so
 * the module-level config only needs to provide a sensible default.
 */
@Module({
  imports: [
    UsersModule,
    LinksModule,
    CardsModule,
    PassportModule,
    JwtModule.registerAsync({
      // AppConfigModule is @Global so AppConfigService is injectable without
      // listing AppConfigModule in `imports` here.
      useFactory: (config: AppConfigService) => ({
        // Module-level default uses the access token secret.
        // AuthService passes an explicit secret on each signAsync call,
        // so this is only used when no per-call override is provided.
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessExpiresIn },
      }),
      inject: [AppConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
