import { IsEmail, MinLength } from 'class-validator';

/**
 * Request body for `POST /auth/link/email`.
 *
 * Links an email address and password to the current anonymous account.
 * The email must be unique across all users (checked server-side),
 * and the password must be at least 8 characters (hashed with Argon2id).
 *
 * Requirements: 1.5, 1.6
 */
export class LinkEmailDto {
  @IsEmail()
  declare email: string;

  @MinLength(8)
  declare password: string;
}
