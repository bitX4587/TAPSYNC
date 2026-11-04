import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables, NodeEnv } from './env.validation.js';

/**
 * Typed wrapper around NestJS's generic {@link ConfigService}.
 *
 * Callers get fully-typed values with no `!` assertions and no stringly-typed
 * key look-ups spread across the codebase.
 *
 * @example
 * ```ts
 * constructor(private readonly config: AppConfigService) {}
 *
 * const uri = this.config.mongodbUri; // string
 * ```
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // ── Application ──────────────────────────────────────────────────────────

  get nodeEnv(): NodeEnv {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  // ── MongoDB ───────────────────────────────────────────────────────────────

  get mongodbUri(): string {
    return this.config.get('MONGODB_URI', { infer: true });
  }

  // ── JWT ───────────────────────────────────────────────────────────────────

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get jwtAccessExpiresIn(): string {
    return this.config.get('JWT_ACCESS_EXPIRES_IN', { infer: true });
  }

  get jwtRefreshExpiresIn(): string {
    return this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true });
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  get googleClientId(): string {
    return this.config.get('GOOGLE_CLIENT_ID', { infer: true });
  }

  // ── Next.js revalidation ──────────────────────────────────────────────────

  get revalidationSecret(): string {
    return this.config.get('REVALIDATION_SECRET', { infer: true });
  }

  get nextPublicUrl(): string {
    return this.config.get('NEXT_PUBLIC_URL', { infer: true });
  }

  /**
   * Parsed list of allowed CORS origins.
   * The raw env value is a comma-separated string; callers receive an array.
   */
  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  // ── Platform Integrity ────────────────────────────────────────────────────

  /**
   * Whether to require a platform integrity token on POST /auth/anonymous.
   * Defaults to false so existing behavior is unchanged until explicitly enabled.
   * Requirements: 1.13
   */
  get playIntegrityEnabled(): boolean {
    return this.config.get('PLAY_INTEGRITY_ENABLED', { infer: true });
  }

  // ── Object storage ────────────────────────────────────────────────────────

  get storageBucket(): string {
    return this.config.get('STORAGE_BUCKET', { infer: true });
  }

  get storageKeyId(): string {
    return this.config.get('STORAGE_KEY_ID', { infer: true });
  }

  get storageSecret(): string {
    return this.config.get('STORAGE_SECRET', { infer: true });
  }

  get storageRegion(): string {
    return this.config.get('STORAGE_REGION', { infer: true });
  }

  get storageCdnUrl(): string | undefined {
    return this.config.get('STORAGE_CDN_URL', { infer: true });
  }
}
