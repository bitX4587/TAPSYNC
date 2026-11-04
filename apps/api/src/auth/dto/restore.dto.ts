import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Request body for `POST /auth/restore`.
 *
 * Exactly one of the three restore methods must be provided:
 *   1. `googleIdToken` — Google OAuth restore
 *   2. `email` + `password` — email and password restore
 *   3. `recoveryCode` — recovery code restore
 *
 * Providing none of the three fields is rejected in the service with a
 * `BadRequestException` (class-level validation would require a custom
 * decorator; the service check keeps it simple and produces a clear message).
 *
 * The caller is the newly-created anonymous account on the new phone
 * (authenticated via JwtAuthGuard). If that account is "untouched" (no links,
 * cards, name or custom name) it is soft-deleted after the restore succeeds.
 *
 * Requirements: 1.8
 */
export class RestoreDto {
  /** Google ID token obtained from the client-side OAuth2 sign-in flow. */
  @IsOptional()
  @IsString()
  googleIdToken?: string;

  /** Email address of the account to restore. */
  @IsOptional()
  @IsEmail()
  email?: string;

  /**
   * Password for the email-based account.
   * Minimum 8 characters (matches the link-email requirement).
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /**
   * Recovery code in the format `xxxxx-xxxxx-xxxxx-xxxxx` (4 groups of 5
   * characters from the look-alike-free alphabet, separated by dashes).
   */
  @IsOptional()
  @IsString()
  recoveryCode?: string;
}
