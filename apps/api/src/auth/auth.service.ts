import * as crypto from 'crypto';

import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { OAuth2Client } from 'google-auth-library';
import { customAlphabet } from 'nanoid';
import { Model } from 'mongoose';

import { AppConfigService } from '../config/app-config.service.js';
import { NfcCard, NfcCardDocument } from '../cards/index.js';
import { ProfileLink, ProfileLinkDocument } from '../links/index.js';
import { User, UserDocument } from '../users/index.js';
import { RestoreDto } from './dto/restore.dto.js';

// ---------------------------------------------------------------------------
// Public ID alphabet and generator
// ---------------------------------------------------------------------------

/**
 * 10-character public ID. Uses a look-alike-free lowercase alphabet
 * (removes 0, 1, i, l, o) for readability, as specified in the design doc.
 * Entropy: 32^10 ≈ 10^15 — extremely low collision probability.
 */
const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const PUBLIC_ID_LENGTH = 10;
const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

// ---------------------------------------------------------------------------
// Recovery code generator
// ---------------------------------------------------------------------------

/**
 * 20-character recovery code from the same look-alike-free alphabet.
 * About 100 bits of entropy. Displayed in 4 groups of 5 separated by dashes.
 */
const RECOVERY_CODE_LENGTH = 20;
const generateRawRecoveryCode = customAlphabet(PUBLIC_ID_ALPHABET, RECOVERY_CODE_LENGTH);

// ---------------------------------------------------------------------------
// Token payload types
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  sub: string;   // MongoDB ObjectId as hex string
  publicId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;   // MongoDB ObjectId as hex string
  tokenId: string;
  type: 'refresh';
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface AnonymousAccountResult {
  accessToken: string;
  refreshToken: string;
  user: {
    publicId: string;
  };
}

// ---------------------------------------------------------------------------
// Token pair returned by refreshTokens()
// ---------------------------------------------------------------------------

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Recovery code result
// ---------------------------------------------------------------------------

export interface RecoveryCodeResult {
  code: string;
}

// ---------------------------------------------------------------------------
// Restore result (same shape as AnonymousAccountResult)
// ---------------------------------------------------------------------------

export interface RestoreResult {
  accessToken: string;
  refreshToken: string;
  user: {
    publicId: string;
  };
}

// ---------------------------------------------------------------------------
// MongoDB duplicate key error code
// ---------------------------------------------------------------------------

const MONGO_DUPLICATE_KEY_ERROR = 11000;

const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

/**
 * Handles authentication operations for the TapSync API.
 *
 * `createAnonymousAccount()` is the entry point for Requirement 1.1:
 * first open creates a credential-less account silently, with no form.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ProfileLink.name) private readonly profileLinkModel: Model<ProfileLinkDocument>,
    @InjectModel(NfcCard.name) private readonly nfcCardModel: Model<NfcCardDocument>,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  // ── createAnonymousAccount ────────────────────────────────────────────────

  /**
   * Creates a credential-less User with a generated `publicId`.
   *
   * - When `config.playIntegrityEnabled` is true and no `integrityToken` is
   *   supplied, throws `BadRequestException` immediately (Req 1.13).
   * - When `config.playIntegrityEnabled` is true and a token is present, logs
   *   a stub message (full cryptographic verification is a future task).
   * - When `config.playIntegrityEnabled` is false (default), skips all checks
   *   entirely — no change to existing behavior.
   * - Generates a 10-character public ID using nanoid with the custom alphabet.
   * - Retries up to 5 times on duplicate key errors (collision is extremely
   *   unlikely but handled for correctness — Req 2.2).
   * - Issues a short-lived access token (15 min) and a rotating refresh token
   *   (365 days) — Req 1.2, 1.11.
   * - Stores only the SHA-256 hash of the refresh token in the database.
   *
   * Requirements: 1.1, 1.2, 1.13, 2.1, 2.2
   */
  async createAnonymousAccount(opts: { integrityToken?: string } = {}): Promise<AnonymousAccountResult> {
    // ── Platform integrity check (optional hardening, Req 1.13) ────────────
    if (this.config.playIntegrityEnabled) {
      if (!opts.integrityToken) {
        throw new BadRequestException('Integrity token required');
      }
      // Stub: full Play Integrity / App Attest cryptographic verification
      // is deferred to a future task. Log a marker so it is easy to find.
      this.logger.log('[stub] Platform integrity verification would be performed here');
    }

    let user: UserDocument | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const publicId = generatePublicId();

      try {
        user = await this.userModel.create({
          publicId,
          activeMode: 'work',
          status: 'active',
        });
        break; // success — exit retry loop
      } catch (err: unknown) {
        if (this.isDuplicateKeyError(err) && attempt < MAX_RETRIES) {
          this.logger.warn(
            `publicId collision on attempt ${attempt}, retrying…`,
          );
          continue;
        }
        // Either not a duplicate key error, or we've exhausted retries
        throw err;
      }
    }

    if (!user) {
      throw new InternalServerErrorException(
        'Failed to generate a unique publicId after maximum retries',
      );
    }

    // ── Issue tokens ──────────────────────────────────────────────────────

    const userId = (user._id as { toString(): string }).toString();

    // Random tokenId ties the hashed entry to this exact issuance
    const tokenId = crypto.randomBytes(32).toString('hex');

    const accessPayload: AccessTokenPayload = {
      sub: userId,
      publicId: user.publicId,
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      tokenId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshExpiresIn,
      }),
    ]);

    // ── Store refresh token hash ──────────────────────────────────────────
    // We store the hash so the raw token never touches the database.

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = this.parseExpiryToDate(this.config.jwtRefreshExpiresIn);

    user.refreshTokenHashes.push({ hash: tokenHash, expiresAt });
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: { publicId: user.publicId },
    };
  }

  // ── refreshTokens ─────────────────────────────────────────────────────────

  /**
   * Rotates a refresh token: verifies the JWT signature, detects reuse,
   * removes the old hash, issues fresh tokens, and stores the new hash.
   *
   * **Reuse detection (Req 1.11):** if the tokenId is not found in the
   * user's stored hashes the token was already rotated — all tokens are
   * immediately revoked for this user.
   *
   * Requirements: 1.2, 1.11
   */
  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    // 1. Verify JWT signature and decode payload
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.config.jwtRefreshSecret },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // 2. Hash the incoming raw token for lookup
    const incomingHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    // 3. Load the user
    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 4. Reject refresh for deleted or suspended accounts
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    // 5. Find the matching stored hash entry
    const matchIndex = user.refreshTokenHashes.findIndex(
      (entry) => entry.hash === incomingHash,
    );

    if (matchIndex === -1) {
      // REUSE DETECTED: revoke the entire token family
      this.logger.warn(
        `Refresh token reuse detected for user ${payload.sub}. Revoking all tokens.`,
      );
      user.refreshTokenHashes = [];
      await user.save();
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // 6. Remove the consumed entry (one-time use)
    user.refreshTokenHashes.splice(matchIndex, 1);

    // 7. Issue new access and refresh tokens
    const userId = (user._id as { toString(): string }).toString();
    const newTokenId = crypto.randomBytes(32).toString('hex');

    const accessPayload: AccessTokenPayload = {
      sub: userId,
      publicId: user.publicId,
      type: 'access',
    };

    const newRefreshPayload: RefreshTokenPayload = {
      sub: userId,
      tokenId: newTokenId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessExpiresIn,
      }),
      this.jwtService.signAsync(newRefreshPayload, {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshExpiresIn,
      }),
    ]);

    // 8. Store the new hash with a sliding 365-day expiry
    const newHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = this.parseExpiryToDate(this.config.jwtRefreshExpiresIn);
    user.refreshTokenHashes.push({ hash: newHash, expiresAt });
    await user.save();

    return { accessToken, refreshToken };
  }

  // ── logout ────────────────────────────────────────────────────────────────

  /**
   * Invalidates a single refresh token by removing its hash from the user
   * document. If the token is already gone (expired, revoked, or unknown)
   * the call is still treated as success so the client always ends up logged
   * out.
   *
   * Requirements: 1.2, 1.11
   */
  async logout(rawRefreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawRefreshToken,
        { secret: this.config.jwtRefreshSecret },
      );
    } catch {
      // An invalid token has no server-side state to clean up — treat as
      // already logged out.
      return;
    }

    if (payload.type !== 'refresh') {
      return;
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const user = await this.userModel.findById(payload.sub).exec();
    if (!user) {
      return;
    }

    const matchIndex = user.refreshTokenHashes.findIndex(
      (entry) => entry.hash === tokenHash,
    );

    if (matchIndex !== -1) {
      user.refreshTokenHashes.splice(matchIndex, 1);
      await user.save();
    }
  }

  // ── linkGoogle ────────────────────────────────────────────────────────────

  /**
   * Links a Google account to the given user by verifying the Google ID token
   * server-side and storing the `sub` claim (googleId) on the user document.
   *
   * - Throws `ConflictException` when the Google account is already linked to
   *   a different user (Req 1.6).
   * - Throws `ConflictException` when the current user already has a Google
   *   account linked (Req 1.6).
   *
   * Requirements: 1.4, 1.6
   */
  async linkGoogle(userId: string, googleIdToken: string): Promise<void> {
    // 1. Verify the Google ID token server-side
    const client = new OAuth2Client(this.config.googleClientId);
    let googleId: string;
    try {
      const ticket = await client.verifyIdToken({
        idToken: googleIdToken,
        audience: this.config.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google ID token payload');
      }
      googleId = payload.sub;
    } catch (err) {
      if (err instanceof ConflictException || err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Google ID token verification failed');
    }

    // 2. Ensure the googleId is not already taken by another account
    const existing = await this.userModel
      .findOne({ googleId, _id: { $ne: userId } })
      .exec();
    if (existing) {
      throw new ConflictException(
        'This Google account is already linked to another user. Restore that account instead.',
      );
    }

    // 3. Load the current user and check they do not already have a Google link
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.googleId) {
      throw new ConflictException('This account already has a Google account linked.');
    }

    // 4. Attach the googleId and persist
    user.googleId = googleId;
    await user.save();
  }

  // ── linkEmail ─────────────────────────────────────────────────────────────

  /**
   * Links an email address and password to the given user.
   *
   * - Lowercases the email before all checks and storage.
   * - Hashes the password with Argon2id.
   * - Throws `ConflictException` when the email is already taken by another
   *   user (Req 1.6).
   * - Throws `ConflictException` when the current user already has an email
   *   linked (Req 1.6).
   * - Sets `emailVerified = false` and stubs a verification email log.
   *
   * Requirements: 1.5, 1.6
   */
  async linkEmail(
    userId: string,
    email: string,
    password: string,
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Ensure the email is not already taken by another account
    const existing = await this.userModel
      .findOne({ email: normalizedEmail, _id: { $ne: userId } })
      .exec();
    if (existing) {
      throw new ConflictException(
        'This email address is already linked to another account. Restore that account instead.',
      );
    }

    // 2. Load the current user and check they do not already have an email linked
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.email) {
      throw new ConflictException('This account already has an email address linked.');
    }

    // 3. Hash the password with Argon2id (Req 1.5, 10.1)
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // 4. Persist the credential
    user.email = normalizedEmail;
    user.passwordHash = passwordHash;
    user.emailVerified = false;
    await user.save();

    // 5. Stub: send verification email (full implementation in a future task)
    this.logger.log(
      `[stub] Verification email would be sent to ${normalizedEmail} for user ${userId}`,
    );
  }

  // ── generateRecoveryCode ──────────────────────────────────────────────────

  /**
   * Generates a 20-character recovery code for the given user.
   *
   * - Uses the same look-alike-free alphabet as the Public ID.
   * - Displays in 4 groups of 5 characters separated by dashes
   *   (e.g. `ab3cd-ef7gh-jk9mn-pq2rs`).
   * - Hashes the raw code with Argon2id and stores only the hash.
   * - Calling again replaces the previous hash, invalidating the old code
   *   (Req 1.7).
   * - Returns `{ code }` with the raw code — shown to the user **once only**.
   *
   * Requirements: 1.7
   */
  async generateRecoveryCode(userId: string): Promise<{ code: string }> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate the raw 20-char code and format as 4 groups of 5
    const raw = generateRawRecoveryCode();
    const code = [
      raw.slice(0, 5),
      raw.slice(5, 10),
      raw.slice(10, 15),
      raw.slice(15, 20),
    ].join('-');

    // Hash the raw code with Argon2id (never store the raw code)
    const hash = await argon2.hash(raw, { type: argon2.argon2id });

    // Replace any existing recovery code hash (Req 1.7: regenerating invalidates the old one)
    user.recoveryCodeHash = hash;
    await user.save();

    return { code };
  }

  // ── restore ───────────────────────────────────────────────────────────────

  /**
   * Restores an existing account on a new phone using one of three methods:
   *   1. Google ID token
   *   2. Email + password (email must be verified)
   *   3. Recovery code
   *
   * After a successful restore, the caller's anonymous account is soft-deleted
   * if it is "untouched" (no links, no bound cards, no full name, no custom
   * name). Tokens are issued for the **restored** (target) account.
   *
   * Requirements: 1.8
   */
  async restore(callerUserId: string, dto: RestoreDto): Promise<RestoreResult> {
    // ── 1. Identify the target account via the chosen restore method ────────

    let targetUser: UserDocument;

    if (dto.googleIdToken) {
      targetUser = await this.restoreWithGoogle(dto.googleIdToken);
    } else if (dto.email && dto.password) {
      targetUser = await this.restoreWithEmail(dto.email, dto.password);
    } else if (dto.recoveryCode) {
      targetUser = await this.restoreWithRecoveryCode(dto.recoveryCode);
    } else {
      throw new BadRequestException(
        'Provide one of: googleIdToken, email + password, or recoveryCode',
      );
    }

    const targetUserId = (targetUser._id as { toString(): string }).toString();

    // ── 2. Issue tokens for the target account ──────────────────────────────

    const tokenId = crypto.randomBytes(32).toString('hex');

    const accessPayload: AccessTokenPayload = {
      sub: targetUserId,
      publicId: targetUser.publicId,
      type: 'access',
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: targetUserId,
      tokenId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshExpiresIn,
      }),
    ]);

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = this.parseExpiryToDate(this.config.jwtRefreshExpiresIn);
    targetUser.refreshTokenHashes.push({ hash: tokenHash, expiresAt });
    await targetUser.save();

    // ── 3. Delete the caller's anonymous account if untouched ───────────────

    if (callerUserId !== targetUserId) {
      await this.deleteUntouchedAnonymousAccount(callerUserId);
    }

    return {
      accessToken,
      refreshToken,
      user: { publicId: targetUser.publicId },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Restores via a Google ID token. Verifies the token server-side and finds
   * the user by their `googleId`.
   */
  private async restoreWithGoogle(googleIdToken: string): Promise<UserDocument> {
    const client = new OAuth2Client(this.config.googleClientId);
    let googleId: string;

    try {
      const ticket = await client.verifyIdToken({
        idToken: googleIdToken,
        audience: this.config.googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google ID token payload');
      }
      googleId = payload.sub;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Google ID token verification failed');
    }

    const user = await this.userModel.findOne({ googleId }).exec();
    if (!user) {
      throw new UnauthorizedException('No account linked to this Google account');
    }

    return user;
  }

  /**
   * Restores via email + password. Lowercases the email, checks `emailVerified`,
   * and verifies the password with Argon2id.
   */
  private async restoreWithEmail(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userModel.findOne({ email: normalizedEmail }).exec();

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Email address is not verified. Verify your email before restoring.',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  /**
   * Restores via a recovery code. Strips dashes from the formatted code and
   * scans users that have a `recoveryCodeHash` set. Clears the hash after
   * a successful match (single-use).
   *
   * Note: this is an O(n) scan over users with recovery codes. For a
   * production system a dedicated lookup index would be more efficient, but
   * the number of users with recovery codes is expected to be small relative
   * to total users and the scan is capped at 1000.
   */
  private async restoreWithRecoveryCode(recoveryCode: string): Promise<UserDocument> {
    // Strip dashes (formatted as xxxxx-xxxxx-xxxxx-xxxxx)
    const rawCode = recoveryCode.replace(/-/g, '');

    // Load candidates — only users that have a recovery code hash set
    const candidates = await this.userModel
      .find({ recoveryCodeHash: { $exists: true, $ne: null } })
      .limit(1000)
      .exec();

    for (const candidate of candidates) {
      if (!candidate.recoveryCodeHash) continue;

      try {
        const matches = await argon2.verify(candidate.recoveryCodeHash, rawCode);

        if (matches) {
          // Single-use: clear the hash so the code cannot be reused
          // Set to null and mark as modified to ensure it's saved
          candidate.set('recoveryCodeHash', null);
          await candidate.save();
          return candidate;
        }
      } catch {
        // argon2.verify can throw for malformed hash strings — skip
        continue;
      }
    }

    throw new UnauthorizedException('Invalid recovery code');
  }

  /**
   * Soft-deletes the caller's anonymous account if it is "untouched":
   * - No `fullName` set
   * - No `customName` set
   * - No `ProfileLink` documents
   * - No `NfcCard` documents bound to the account
   */
  private async deleteUntouchedAnonymousAccount(
    callerUserId: string,
  ): Promise<void> {
    const callerUser = await this.userModel.findById(callerUserId).exec();
    if (!callerUser) return;

    // Check profile fields
    if (callerUser.fullName || callerUser.customName) return;

    // Check for any links
    const linkCount = await this.profileLinkModel
      .countDocuments({ userId: callerUserId })
      .exec();
    if (linkCount > 0) return;

    // Check for any bound cards
    const cardCount = await this.nfcCardModel
      .countDocuments({ mappedUserId: callerUserId })
      .exec();
    if (cardCount > 0) return;

    // Account is untouched — soft delete it
    callerUser.status = 'deleted';
    await callerUser.save();
  }

  /**
   * Returns true when the caught error is a MongoDB duplicate key error (11000).
   */
  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === MONGO_DUPLICATE_KEY_ERROR
    );
  }

  /**
   * Converts a duration string (e.g. "365d", "15m", "1h") to a future Date.
   * Supports seconds (s), minutes (m), hours (h) and days (d).
   */
  private parseExpiryToDate(expiry: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) {
      // Fallback: 365 days
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;

    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return new Date(Date.now() + value * (multipliers[unit] ?? 86_400_000));
  }
}
