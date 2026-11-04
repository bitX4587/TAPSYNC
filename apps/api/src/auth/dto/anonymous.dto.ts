import { IsOptional, IsString } from 'class-validator';

/**
 * Optional request body for POST /auth/anonymous.
 *
 * When Play Integrity / App Attest hardening is enabled via the
 * PLAY_INTEGRITY_ENABLED environment variable, the client MUST supply
 * an `integrityToken` obtained from the platform's attestation API.
 *
 * When the hardening flag is disabled (the default), this DTO is accepted
 * but the `integrityToken` field is ignored so existing clients break
 * nothing.
 *
 * Requirements: 1.13
 */
export class AnonymousDto {
  @IsOptional()
  @IsString()
  integrityToken?: string;
}
