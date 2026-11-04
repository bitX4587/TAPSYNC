import { IsString } from 'class-validator';

/**
 * Request body for both `POST /auth/refresh` and `POST /auth/logout`.
 *
 * The raw refresh token (JWT) is accepted as an opaque string; the service
 * layer verifies its signature and looks up the stored hash.
 */
export class RefreshTokenDto {
  @IsString()
  declare refreshToken: string;
}
