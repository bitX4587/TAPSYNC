import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * Guard that protects routes requiring a valid JWT access token.
 *
 * Apply it to any controller or handler that should be owner-only:
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('/user/me')
 * getMe(@Req() req: Request) { ... }
 * ```
 *
 * On a valid token, `req.user` will contain `{ userId: string, publicId: string }`
 * as returned by `JwtStrategy.validate()`.
 *
 * Requirements: 1.2, 1.11, 10.4
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Delegates to the Passport 'jwt' strategy and converts any authentication
   * failure into a clean `UnauthorizedException` (401).
   */
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  /**
   * Called by Passport after authentication completes.
   * Re-throws errors as `UnauthorizedException` so callers always see a 401
   * rather than a Passport-specific error object.
   */
  override handleRequest<TUser>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException(err?.message ?? 'Unauthorized');
    }
    return user;
  }
}
