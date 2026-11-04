export { AuthModule } from './auth.module.js';
export { AuthService } from './auth.service.js';
export type {
  AccessTokenPayload,
  RefreshTokenPayload,
  AnonymousAccountResult,
  TokenPair,
  RecoveryCodeResult,
  RestoreResult,
} from './auth.service.js';
export { JwtAuthGuard } from './guards/jwt-auth.guard.js';
export { JwtStrategy } from './strategies/jwt.strategy.js';
export { RefreshTokenDto } from './dto/refresh-token.dto.js';
export { LinkGoogleDto } from './dto/link-google.dto.js';
export { LinkEmailDto } from './dto/link-email.dto.js';
export { RestoreDto } from './dto/restore.dto.js';
export { CurrentUser } from './decorators/current-user.decorator.js';
