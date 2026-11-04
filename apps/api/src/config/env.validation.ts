import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Max,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

/**
 * All environment variables consumed by the API.
 *
 * Required variables will cause the application to throw and refuse to start
 * when absent (fail-fast). Optional variables are decorated with @IsOptional.
 */
export class EnvironmentVariables {
  // ── Application ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  // ── MongoDB ───────────────────────────────────────────────────────────────

  @IsString()
  MONGODB_URI!: string;

  // ── JWT ───────────────────────────────────────────────────────────────────

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  /** Duration string accepted by the `jsonwebtoken` library, e.g. "15m". */
  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  /** Duration string accepted by the `jsonwebtoken` library, e.g. "365d". */
  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '365d';

  // ── Google OAuth ──────────────────────────────────────────────────────────

  @IsString()
  GOOGLE_CLIENT_ID!: string;

  // ── Next.js revalidation ──────────────────────────────────────────────────

  @IsString()
  REVALIDATION_SECRET!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  NEXT_PUBLIC_URL: string = 'http://localhost:3000';

  /**
   * Comma-separated list of allowed CORS origins.
   * Defaults to the Next.js dev server and the production domain.
   * Example: "https://tapsync.app,https://www.tapsync.app"
   */
  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  // ── Platform Integrity (Play Integrity / App Attest) ─────────────────────

  /**
   * Whether to require a platform integrity token on POST /auth/anonymous.
   * Defaults to false so the check is disabled until explicitly enabled.
   * Requirements: 1.13
   */
  @IsOptional()
  @IsBoolean()
  PLAY_INTEGRITY_ENABLED: boolean = false;

  /**
   * Google Play Integrity API decryption key. Only needed when
   * PLAY_INTEGRITY_ENABLED is true and full server-side verification is
   * implemented in a future task. Optional and unused by the current stub.
   */
  @IsOptional()
  @IsString()
  PLAY_INTEGRITY_DECRYPTION_KEY?: string;

  // ── Object storage (S3-compatible) ────────────────────────────────────────

  @IsString()
  STORAGE_BUCKET!: string;

  /** S3-compatible access key ID (STORAGE_KEY_ID in .env). */
  @IsString()
  STORAGE_KEY_ID!: string;

  /** S3-compatible secret access key (STORAGE_SECRET in .env). */
  @IsString()
  STORAGE_SECRET!: string;

  @IsOptional()
  @IsString()
  STORAGE_REGION: string = 'us-east-1';

  @IsOptional()
  @IsUrl({ require_tld: false })
  STORAGE_CDN_URL?: string;
}

/**
 * Validates the raw `process.env` object against {@link EnvironmentVariables}.
 *
 * Called once by `@nestjs/config` at startup. Any validation error is thrown
 * immediately so the process exits before attempting to connect to any service.
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => {
        const constraints = Object.values(e.constraints ?? {}).join(', ');
        return `  • ${e.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${messages}`);
  }

  return validated;
}
