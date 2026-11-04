import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfigService } from '../../config/app-config.service.js';
import { AccessTokenPayload } from '../auth.service.js';

/**
 * Passport JWT strategy for access token validation.
 *
 * - Extracts the Bearer token from the `Authorization` header.
 * - Validates the signature against `JWT_ACCESS_SECRET`.
 * - Rejects tokens that have `type !== 'access'` (prevents refresh tokens
 *   being used in place of access tokens).
 *
 * On success, the return value of `validate()` is attached to `req.user`
 * and is available to every route handler that uses `JwtAuthGuard`.
 *
 * Requirements: 1.2, 1.11, 10.4
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtAccessSecret,
    });
  }

  /**
   * Called by Passport after the JWT signature and expiry have been verified.
   *
   * @param payload - The decoded JWT payload.
   * @returns The object that will be set on `req.user`.
   * @throws UnauthorizedException when the token type is not `'access'`.
   */
  validate(payload: AccessTokenPayload): { userId: string; publicId: string } {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    return {
      userId: payload.sub,
      publicId: payload.publicId,
    };
  }
}
