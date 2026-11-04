import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService, AnonymousAccountResult, TokenPair, RecoveryCodeResult, RestoreResult } from './auth.service.js';
import { AnonymousDto } from './dto/anonymous.dto.js';
import { LinkEmailDto } from './dto/link-email.dto.js';
import { LinkGoogleDto } from './dto/link-google.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RestoreDto } from './dto/restore.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

/**
 * Handles authentication endpoints.
 *
 * All auth routes are rate-limited with the `strict` named throttler
 * (10 req / 60 s per IP) to satisfy Requirements 1.12 and 1.13.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Creates a credential-less anonymous account and returns tokens.
   *
   * When `PLAY_INTEGRITY_ENABLED` is true, the client must supply an
   * `integrityToken` in the request body (Play Integrity / App Attest).
   * When the flag is false (default), the body is accepted but ignored so
   * existing clients are unaffected.
   *
   * Requirements: 1.1, 1.2, 1.13, 2.1, 2.2
   *
   * @returns 201 `{ accessToken, refreshToken, user: { publicId } }`
   */
  @Post('anonymous')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  createAnonymous(@Body() dto: AnonymousDto): Promise<AnonymousAccountResult> {
    return this.authService.createAnonymousAccount(dto);
  }

  /**
   * Rotates a refresh token and returns a fresh token pair.
   *
   * The old refresh token is consumed (single-use). Reuse of a superseded
   * token revokes the entire token family for that user.
   *
   * Requirements: 1.2, 1.11
   *
   * @returns 200 `{ accessToken, refreshToken }`
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Invalidates a single refresh token, effectively logging out from that
   * device / session.
   *
   * If the token is already invalid the call is still treated as a success
   * so the client always ends up logged out.
   *
   * Requirements: 1.2, 1.11
   *
   * @returns 204 No Content
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * Links a Google account to the currently authenticated user.
   *
   * Verifies the Google ID token server-side; rejects if the Google account is
   * already linked to a different account.
   *
   * Requirements: 1.4, 1.6
   *
   * @returns 200 OK (empty body)
   */
  @Post('link/google')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  linkGoogle(
    @Req() req: { user: { userId: string; publicId: string } },
    @Body() dto: LinkGoogleDto,
  ): Promise<void> {
    return this.authService.linkGoogle(req.user.userId, dto.idToken);
  }

  /**
   * Links an email address and password to the currently authenticated user.
   *
   * Hashes the password with Argon2id; sends a verification email (stub).
   * Rejects if the email is already linked to a different account.
   *
   * Requirements: 1.5, 1.6
   *
   * @returns 200 OK (empty body)
   */
  @Post('link/email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  linkEmail(
    @Req() req: { user: { userId: string; publicId: string } },
    @Body() dto: LinkEmailDto,
  ): Promise<void> {
    return this.authService.linkEmail(req.user.userId, dto.email, dto.password);
  }

  /**
   * Generates (or regenerates) a recovery code for the authenticated user.
   *
   * The raw code is returned **once** in the response. Only an Argon2id hash
   * is stored server-side. Calling this endpoint again invalidates the previous
   * code (Req 1.7).
   *
   * Requirements: 1.7
   *
   * @returns 200 `{ code: string }` — show this to the user exactly once
   */
  @Post('recovery-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  generateRecoveryCode(
    @Req() req: { user: { userId: string; publicId: string } },
  ): Promise<RecoveryCodeResult> {
    return this.authService.generateRecoveryCode(req.user.userId);
  }

  /**
   * Restores an existing account on a new phone using Google, email + password,
   * or a recovery code.
   *
   * The caller must be authenticated (the new phone's anonymous session is
   * the credential). If the caller's anonymous account is untouched (no links,
   * cards or name), it is soft-deleted after the restore.
   *
   * Requirements: 1.8
   *
   * @returns 200 `{ accessToken, refreshToken, user: { publicId } }`
   */
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ strict: { ttl: 60_000, limit: 10 } })
  restore(
    @Req() req: { user: { userId: string; publicId: string } },
    @Body() dto: RestoreDto,
  ): Promise<RestoreResult> {
    return this.authService.restore(req.user.userId, dto);
  }
}

