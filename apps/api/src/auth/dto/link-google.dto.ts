import { IsString } from 'class-validator';

/**
 * Request body for `POST /auth/link/google`.
 *
 * The `idToken` is the Google ID token obtained from the OAuth2 sign-in flow
 * on the client. It is verified server-side via OAuth2Client.verifyIdToken.
 *
 * Requirements: 1.4, 1.6
 */
export class LinkGoogleDto {
  @IsString()
  declare idToken: string;
}
