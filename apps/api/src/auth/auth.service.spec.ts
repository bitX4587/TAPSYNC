/**
 * Unit tests for AuthService
 *
 * Strategy: mock the User Mongoose model and JwtService so we only exercise
 * the AuthService logic itself (no database or real JWT signing required).
 *
 * Covers:
 *  - createAnonymousAccount(): publicId generation, token issuance, hash
 *    storage, collision retry (Req 1.1, 1.2, 2.1, 2.2)
 *  - refreshTokens(): happy path rotation, reuse detection/revocation (Req 1.11)
 *  - logout(): removes the matching hash entry (Req 1.2, 1.11)
 *  - linkGoogle(): links a Google account, rejects conflicts (Req 1.4, 1.6)
 *  - linkEmail(): links email + password, rejects conflicts (Req 1.5, 1.6)
 */

import * as crypto from 'crypto';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

import { AppConfigService } from '../config/app-config.service.js';
import { NfcCard } from '../cards/index.js';
import { ProfileLink } from '../links/index.js';
import { User } from '../users/index.js';
import { AuthService } from './auth.service.js';

// ---------------------------------------------------------------------------
// Mock google-auth-library at the module level so new OAuth2Client() inside
// the service returns a controllable fake.
// ---------------------------------------------------------------------------

const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// ---------------------------------------------------------------------------
// Mock argon2 so tests are fast and deterministic
// ---------------------------------------------------------------------------

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('$argon2id$hashed-password'),
  verify: jest.fn().mockResolvedValue(false),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC_ID_ALPHABET = new Set('23456789abcdefghjkmnpqrstuvwxyz');

function isValidPublicId(id: string): boolean {
  return (
    id.length === 10 && [...id].every((ch) => PUBLIC_ID_ALPHABET.has(ch))
  );
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Builds a minimal saved User-like object that AuthService expects back from
 * `userModel.create()`.
 */
function makeSavedUser(
  publicId: string,
  extraHashes: { hash: string; expiresAt: Date }[] = [],
  overrides: Record<string, unknown> = {},
): {
  _id: { toString(): string };
  publicId: string;
  refreshTokenHashes: { hash: string; expiresAt: Date }[];
  save: jest.Mock;
  googleId?: string;
  email?: string;
  passwordHash?: string;
  emailVerified?: boolean;
  [key: string]: unknown;
} {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    publicId,
    refreshTokenHashes: [...extraHashes] as { hash: string; expiresAt: Date }[],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Duplicate key error matching MongoDB error code 11000
function makeDuplicateKeyError() {
  return Object.assign(new Error('duplicate key'), { code: 11000 });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;

  // Mocks replaced per test with jest.fn() where needed
  let mockCreate: jest.Mock;
  let mockFindById: jest.Mock;
  let mockFindOne: jest.Mock;
  let mockFind: jest.Mock;
  let mockJwtSignAsync: jest.Mock;
  let mockJwtVerifyAsync: jest.Mock;
  // profileLinkModel and nfcCardModel mocks
  let mockLinkCountDocuments: jest.Mock;
  let mockCardCountDocuments: jest.Mock;

  const mockAppConfig = {
    jwtAccessSecret: 'test-access-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtAccessExpiresIn: '15m',
    jwtRefreshExpiresIn: '365d',
    googleClientId: 'test-google-client-id',
    playIntegrityEnabled: false,
  };

  beforeEach(async () => {
    mockCreate = jest.fn();
    // findById returns a chainable exec() mock by default
    mockFindById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockFindOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockFind = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) });
    mockJwtSignAsync = jest
      .fn()
      .mockResolvedValueOnce('mock-access-token')
      .mockResolvedValueOnce('mock-refresh-token');
    mockJwtVerifyAsync = jest.fn();
    mockLinkCountDocuments = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
    mockCardCountDocuments = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(User.name),
          useValue: {
            create: mockCreate,
            findById: mockFindById,
            findOne: mockFindOne,
            find: mockFind,
          },
        },
        {
          provide: getModelToken(ProfileLink.name),
          useValue: {
            countDocuments: mockLinkCountDocuments,
          },
        },
        {
          provide: getModelToken(NfcCard.name),
          useValue: {
            countDocuments: mockCardCountDocuments,
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: mockJwtSignAsync,
            verifyAsync: mockJwtVerifyAsync,
          },
        },
        {
          provide: AppConfigService,
          useValue: mockAppConfig,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Reset the google mock before each test
    mockVerifyIdToken.mockReset();
  });

  // ── createAnonymousAccount – happy path ────────────────────────────────────

  describe('createAnonymousAccount() – happy path', () => {
    it('creates a User with a valid publicId and no credentials', async () => {
      const savedUser = makeSavedUser('abc2345678');
      mockCreate.mockResolvedValue(savedUser);

      await service.createAnonymousAccount();

      expect(mockCreate).toHaveBeenCalledTimes(1);

      const createArg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof createArg['publicId']).toBe('string');
      expect(isValidPublicId(createArg['publicId'] as string)).toBe(true);

      // No credentials on an anonymous account
      expect(createArg['email']).toBeUndefined();
      expect(createArg['passwordHash']).toBeUndefined();
      expect(createArg['googleId']).toBeUndefined();

      expect(createArg['activeMode']).toBe('work');
      expect(createArg['status']).toBe('active');
    });

    it('returns accessToken, refreshToken and user.publicId', async () => {
      const publicId = 'abc2345678';
      const savedUser = makeSavedUser(publicId);
      mockCreate.mockResolvedValue(savedUser);

      const result = await service.createAnonymousAccount();

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.publicId).toBe(publicId);
    });

    it('stores a non-empty hash of the refresh token on the user document', async () => {
      const savedUser = makeSavedUser('abc2345678');
      mockCreate.mockResolvedValue(savedUser);

      await service.createAnonymousAccount();

      expect(savedUser.refreshTokenHashes).toHaveLength(1);

      const entry = savedUser.refreshTokenHashes[0]!;
      expect(typeof entry.hash).toBe('string');
      expect(entry.hash.length).toBeGreaterThan(0);
      // Raw token must NOT be stored — the hash should differ from the token
      expect(entry.hash).not.toBe('mock-refresh-token');
      expect(entry.expiresAt).toBeInstanceOf(Date);

      // user.save() must have been called after pushing the hash
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('signs the access token with correct payload shape', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockCreate.mockResolvedValue(savedUser);

      await service.createAnonymousAccount();

      const [accessCall] = mockJwtSignAsync.mock.calls as [
        [AccessPayload, SignOptions],
        ...unknown[]
      ][];

      expect(accessCall![0]).toMatchObject({
        sub: '507f1f77bcf86cd799439011',
        publicId: 'testpublic1',
        type: 'access',
      });

      expect(accessCall![1]).toMatchObject({
        secret: 'test-access-secret',
        expiresIn: '15m',
      });
    });

    it('signs the refresh token with correct payload shape', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockCreate.mockResolvedValue(savedUser);

      await service.createAnonymousAccount();

      const [, refreshCall] = mockJwtSignAsync.mock.calls as [
        unknown,
        [RefreshPayload, SignOptions]
      ];

      expect(refreshCall![0]).toMatchObject({
        sub: '507f1f77bcf86cd799439011',
        type: 'refresh',
      });
      expect(typeof (refreshCall![0] as RefreshPayload).tokenId).toBe('string');
      expect((refreshCall![0] as RefreshPayload).tokenId.length).toBeGreaterThan(0);

      expect(refreshCall![1]).toMatchObject({
        secret: 'test-refresh-secret',
        expiresIn: '365d',
      });
    });
  });

  // ── createAnonymousAccount – collision retry ───────────────────────────────

  describe('createAnonymousAccount() – collision retry', () => {
    it('retries after a duplicate-key error and succeeds on the second attempt', async () => {
      const savedUser = makeSavedUser('abc9876543');
      mockJwtSignAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');

      mockCreate
        .mockRejectedValueOnce(makeDuplicateKeyError()) // first attempt: collision
        .mockResolvedValueOnce(savedUser);              // second attempt: success

      const result = await service.createAnonymousAccount();

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.user.publicId).toBe('abc9876543');
    });

    it('generates a different publicId on each retry attempt', async () => {
      const savedUser = makeSavedUser('newid12345');
      mockJwtSignAsync
        .mockResolvedValueOnce('at')
        .mockResolvedValueOnce('rt');

      mockCreate
        .mockRejectedValueOnce(makeDuplicateKeyError())
        .mockResolvedValueOnce(savedUser);

      await service.createAnonymousAccount();

      const ids = mockCreate.mock.calls.map(
        (call) => (call[0] as Record<string, string>)['publicId'] ?? '',
      );
      // Each call should have a valid publicId
      expect(ids.every(isValidPublicId)).toBe(true);
    });

    it('throws after exhausting the maximum retry limit', async () => {
      // Every call fails with a duplicate key error
      mockCreate.mockRejectedValue(makeDuplicateKeyError());

      await expect(service.createAnonymousAccount()).rejects.toMatchObject({
        code: 11000,
      });

      expect(mockCreate).toHaveBeenCalledTimes(5); // MAX_RETRIES = 5
    });

    it('re-throws immediately for non-duplicate-key errors', async () => {
      const networkError = new Error('connection refused');
      mockCreate.mockRejectedValue(networkError);

      await expect(service.createAnonymousAccount()).rejects.toThrow(
        'connection refused',
      );
      // Should NOT retry for unrelated errors
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  // ── createAnonymousAccount – Play Integrity hardening hook ────────────────

  describe('createAnonymousAccount() – Play Integrity hardening hook (Req 1.13)', () => {
    it('throws BadRequestException when playIntegrityEnabled=true and no integrityToken is provided', async () => {
      // Override the shared mockAppConfig for this test only
      const strictModule = await Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: getModelToken(User.name),
            useValue: { create: mockCreate, findById: mockFindById, findOne: mockFindOne, find: mockFind },
          },
          {
            provide: getModelToken(ProfileLink.name),
            useValue: { countDocuments: mockLinkCountDocuments },
          },
          {
            provide: getModelToken(NfcCard.name),
            useValue: { countDocuments: mockCardCountDocuments },
          },
          {
            provide: JwtService,
            useValue: { signAsync: mockJwtSignAsync, verifyAsync: mockJwtVerifyAsync },
          },
          {
            provide: AppConfigService,
            useValue: { ...mockAppConfig, playIntegrityEnabled: true },
          },
        ],
      }).compile();

      const strictService = strictModule.get<AuthService>(AuthService);

      const { BadRequestException } = await import('@nestjs/common');
      await expect(strictService.createAnonymousAccount({})).rejects.toThrow(
        BadRequestException,
      );
      await expect(strictService.createAnonymousAccount({})).rejects.toThrow(
        'Integrity token required',
      );

      // userModel.create() must NOT have been called — request should be rejected early
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('proceeds normally when playIntegrityEnabled=true and an integrityToken is provided', async () => {
      const strictModule = await Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: getModelToken(User.name),
            useValue: { create: mockCreate, findById: mockFindById, findOne: mockFindOne, find: mockFind },
          },
          {
            provide: getModelToken(ProfileLink.name),
            useValue: { countDocuments: mockLinkCountDocuments },
          },
          {
            provide: getModelToken(NfcCard.name),
            useValue: { countDocuments: mockCardCountDocuments },
          },
          {
            provide: JwtService,
            useValue: { signAsync: mockJwtSignAsync, verifyAsync: mockJwtVerifyAsync },
          },
          {
            provide: AppConfigService,
            useValue: { ...mockAppConfig, playIntegrityEnabled: true },
          },
        ],
      }).compile();

      const strictService = strictModule.get<AuthService>(AuthService);

      const savedUser = makeSavedUser('integrity1a');
      mockCreate.mockResolvedValue(savedUser);
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('access-with-integrity')
        .mockResolvedValueOnce('refresh-with-integrity');

      const result = await strictService.createAnonymousAccount({
        integrityToken: 'valid-platform-token',
      });

      // Account was created successfully
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe('access-with-integrity');
      expect(result.refreshToken).toBe('refresh-with-integrity');
      expect(result.user.publicId).toBe('integrity1a');
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    const RAW_REFRESH_TOKEN = 'raw.refresh.token.value';
    const STORED_HASH = sha256(RAW_REFRESH_TOKEN);
    const USER_ID = '507f1f77bcf86cd799439011';

    const validRefreshPayload = {
      sub: USER_ID,
      tokenId: 'some-token-id',
      type: 'refresh' as const,
    };

    it('happy path: removes the old hash, adds a new hash, returns new tokens', async () => {
      const existingEntry = {
        hash: STORED_HASH,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };
      const savedUser = makeSavedUser('testpublic1', [existingEntry]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      // Reset the sign mock (beforeEach pre-loaded two values for createAnonymousAccount)
      // and provide values for this refreshTokens() call instead.
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens(RAW_REFRESH_TOKEN);

      // Returns fresh tokens
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');

      // Old hash was consumed and a new one added
      expect(savedUser.refreshTokenHashes).toHaveLength(1);
      const newEntry = savedUser.refreshTokenHashes[0]!;
      expect(newEntry.hash).not.toBe(STORED_HASH);
      expect(newEntry.hash).toBe(sha256('new-refresh-token'));
      expect(newEntry.expiresAt).toBeInstanceOf(Date);

      // User was saved
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('verifies the JWT using jwtRefreshSecret', async () => {
      const savedUser = makeSavedUser('testpublic1', [
        { hash: STORED_HASH, expiresAt: new Date() },
      ]);
      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('at')
        .mockResolvedValueOnce('rt');

      await service.refreshTokens(RAW_REFRESH_TOKEN);

      expect(mockJwtVerifyAsync).toHaveBeenCalledWith(RAW_REFRESH_TOKEN, {
        secret: 'test-refresh-secret',
      });
    });

    it('throws UnauthorizedException when JWT signature is invalid', async () => {
      mockJwtVerifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.refreshTokens('bad.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when token type is not "refresh"', async () => {
      mockJwtVerifyAsync.mockResolvedValue({
        sub: USER_ID,
        publicId: 'abc',
        type: 'access',
      });

      await expect(service.refreshTokens(RAW_REFRESH_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('REUSE DETECTION: revokes all tokens and throws when hash is not found', async () => {
      const savedUser = makeSavedUser('testpublic1', [
        {
          hash: 'some-other-hash-entirely',
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          hash: 'another-hash',
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await expect(service.refreshTokens(RAW_REFRESH_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );

      // All tokens must be revoked
      expect(savedUser.refreshTokenHashes).toHaveLength(0);
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('REUSE DETECTION: revokes all tokens even when list was empty', async () => {
      const savedUser = makeSavedUser('testpublic1', []);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await expect(service.refreshTokens(RAW_REFRESH_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(savedUser.refreshTokenHashes).toHaveLength(0);
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('issues new access and refresh tokens with correct payload shapes', async () => {
      const savedUser = makeSavedUser('pubidxyz123', [
        { hash: STORED_HASH, expiresAt: new Date() },
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('new-at')
        .mockResolvedValueOnce('new-rt');

      await service.refreshTokens(RAW_REFRESH_TOKEN);

      const [accessCallArgs, refreshCallArgs] = mockJwtSignAsync.mock.calls as [
        [AccessPayload, SignOptions],
        [RefreshPayload, SignOptions],
      ];

      // Access token payload
      expect(accessCallArgs![0]).toMatchObject({
        sub: USER_ID,
        publicId: 'pubidxyz123',
        type: 'access',
      });
      expect(accessCallArgs![1]).toMatchObject({
        secret: 'test-access-secret',
        expiresIn: '15m',
      });

      // Refresh token payload
      expect(refreshCallArgs![0]).toMatchObject({
        sub: USER_ID,
        type: 'refresh',
      });
      expect(typeof (refreshCallArgs![0] as RefreshPayload).tokenId).toBe('string');
      expect(refreshCallArgs![1]).toMatchObject({
        secret: 'test-refresh-secret',
        expiresIn: '365d',
      });
    });

    it('does not consume or modify other hash entries for the same user', async () => {
      const otherEntry = {
        hash: 'unrelated-hash-for-another-device',
        expiresAt: new Date(Date.now() + 86400000),
      };
      const savedUser = makeSavedUser('testpublic1', [
        { hash: STORED_HASH, expiresAt: new Date() },
        otherEntry,
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('at')
        .mockResolvedValueOnce('rt');

      await service.refreshTokens(RAW_REFRESH_TOKEN);

      // The other device's token must still be there
      expect(
        savedUser.refreshTokenHashes.some((e) => e.hash === otherEntry.hash),
      ).toBe(true);
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    const RAW_REFRESH_TOKEN = 'raw.logout.token';
    const STORED_HASH = sha256(RAW_REFRESH_TOKEN);
    const USER_ID = '507f1f77bcf86cd799439011';

    const validRefreshPayload = {
      sub: USER_ID,
      tokenId: 'tid-logout',
      type: 'refresh' as const,
    };

    it('removes the matching hash entry from the user document', async () => {
      const savedUser = makeSavedUser('logoutuser1', [
        { hash: STORED_HASH, expiresAt: new Date(Date.now() + 86400000) },
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.logout(RAW_REFRESH_TOKEN);

      expect(savedUser.refreshTokenHashes).toHaveLength(0);
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('leaves other hash entries untouched', async () => {
      const otherEntry = {
        hash: 'other-device-hash',
        expiresAt: new Date(Date.now() + 86400000),
      };
      const savedUser = makeSavedUser('logoutuser1', [
        { hash: STORED_HASH, expiresAt: new Date() },
        otherEntry,
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.logout(RAW_REFRESH_TOKEN);

      expect(savedUser.refreshTokenHashes).toHaveLength(1);
      expect(savedUser.refreshTokenHashes[0]!.hash).toBe(otherEntry.hash);
    });

    it('does not throw when the token hash is not found (already logged out)', async () => {
      const savedUser = makeSavedUser('logoutuser1', [
        { hash: 'completely-different-hash', expiresAt: new Date() },
      ]);

      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      // Should not throw
      await expect(service.logout(RAW_REFRESH_TOKEN)).resolves.toBeUndefined();

      // Nothing was changed — no save()
      expect(savedUser.save).not.toHaveBeenCalled();
    });

    it('does not throw when the JWT is invalid (treats as already logged out)', async () => {
      mockJwtVerifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.logout('expired.token')).resolves.toBeUndefined();
    });

    it('does not throw when the user is not found', async () => {
      mockJwtVerifyAsync.mockResolvedValue(validRefreshPayload);
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.logout(RAW_REFRESH_TOKEN)).resolves.toBeUndefined();
    });

    it('does not throw when the token type is not "refresh"', async () => {
      mockJwtVerifyAsync.mockResolvedValue({
        sub: USER_ID,
        publicId: 'abc',
        type: 'access',
      });

      await expect(service.logout(RAW_REFRESH_TOKEN)).resolves.toBeUndefined();
    });
  });

  // ── generateRecoveryCode ───────────────────────────────────────────────────

  describe('generateRecoveryCode()', () => {
    const USER_ID = '507f1f77bcf86cd799439011';
    const RECOVERY_CODE_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}$/;

    it('returns a code in the format xxxxx-xxxxx-xxxxx-xxxxx (4 groups of 5 from the allowed alphabet)', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      const result = await service.generateRecoveryCode(USER_ID);

      expect(result.code).toMatch(RECOVERY_CODE_PATTERN);
    });

    it('stores an Argon2id hash in recoveryCodeHash (not the raw code)', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      const result = await service.generateRecoveryCode(USER_ID);

      // The hash stored in DB must differ from the returned code
      expect(savedUser.recoveryCodeHash).toBeDefined();
      expect(savedUser.recoveryCodeHash).not.toBe(result.code);
      // The mock argon2.hash returns '$argon2id$hashed-password'
      expect(savedUser.recoveryCodeHash).toBe('$argon2id$hashed-password');
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('replaces the existing recoveryCodeHash when called again (regenerating invalidates old code)', async () => {
      const savedUser = makeSavedUser('testpublic1', [], {
        recoveryCodeHash: 'old-argon2id-hash',
      });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.generateRecoveryCode(USER_ID);

      // Old hash must be replaced
      expect(savedUser.recoveryCodeHash).toBe('$argon2id$hashed-password');
      expect(savedUser.recoveryCodeHash).not.toBe('old-argon2id-hash');
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('hashes the raw code (not the formatted code with dashes)', async () => {
      const argon2Mock = jest.requireMock('argon2') as { hash: jest.Mock };
      argon2Mock.hash.mockClear();

      const savedUser = makeSavedUser('testpublic1');
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      const result = await service.generateRecoveryCode(USER_ID);

      // The argument passed to argon2.hash should NOT contain dashes
      const hashedArg = argon2Mock.hash.mock.calls[0]![0] as string;
      expect(hashedArg).not.toContain('-');
      // The raw arg is 20 chars (no dashes), while the returned code has dashes
      expect(hashedArg.length).toBe(20);
      expect(result.code.replace(/-/g, '').length).toBe(20);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.generateRecoveryCode(USER_ID)).rejects.toThrow(
        'User not found',
      );
    });
  });

  // ── linkGoogle ─────────────────────────────────────────────────────────────

  describe('linkGoogle()', () => {
    const USER_ID = '507f1f77bcf86cd799439011';
    const GOOGLE_ID_TOKEN = 'valid.google.id.token';
    const GOOGLE_SUB = 'google-sub-123456';

    function makeGoogleTicket(sub: string) {
      return {
        getPayload: () => ({ sub }),
      };
    }

    it('happy path: sets googleId on the user and saves', async () => {
      const savedUser = makeSavedUser('testpublic1');
      // No conflict — findOne returns null
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      // Current user found with no existing googleId
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));

      await service.linkGoogle(USER_ID, GOOGLE_ID_TOKEN);

      expect(savedUser.googleId).toBe(GOOGLE_SUB);
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the googleId is already linked to another user', async () => {
      const otherUser = makeSavedUser('otherpublic1', [], { googleId: GOOGLE_SUB });
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));
      // Another user already has this googleId
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(otherUser) });

      await expect(service.linkGoogle(USER_ID, GOOGLE_ID_TOKEN)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when the current user already has a googleId', async () => {
      const savedUser = makeSavedUser('testpublic1', [], { googleId: 'existing-google-id' });
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));
      // No conflict with another user
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      // Current user already has a googleId
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await expect(service.linkGoogle(USER_ID, GOOGLE_ID_TOKEN)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws UnauthorizedException when the Google ID token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.linkGoogle(USER_ID, GOOGLE_ID_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('uses the configured googleClientId as the audience for token verification', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));

      await service.linkGoogle(USER_ID, GOOGLE_ID_TOKEN);

      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: GOOGLE_ID_TOKEN,
        audience: 'test-google-client-id',
      });
    });
  });

  // ── linkEmail ──────────────────────────────────────────────────────────────

  describe('linkEmail()', () => {
    const USER_ID = '507f1f77bcf86cd799439011';
    const EMAIL = 'Test@Example.com';
    const NORMALIZED_EMAIL = 'test@example.com';
    const PASSWORD = 'securepassword123';

    it('happy path: sets email, passwordHash and emailVerified=false on the user', async () => {
      const savedUser = makeSavedUser('testpublic1');
      // No conflict
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.linkEmail(USER_ID, EMAIL, PASSWORD);

      expect(savedUser.email).toBe(NORMALIZED_EMAIL);
      expect(savedUser.passwordHash).toBe('$argon2id$hashed-password');
      expect(savedUser.emailVerified).toBe(false);
      expect(savedUser.save).toHaveBeenCalledTimes(1);
    });

    it('normalizes the email to lowercase before storing', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.linkEmail(USER_ID, 'UPPER@CASE.COM', PASSWORD);

      expect(savedUser.email).toBe('upper@case.com');
    });

    it('throws ConflictException when the email is already linked to another user', async () => {
      const otherUser = makeSavedUser('otherpublic1', [], { email: NORMALIZED_EMAIL });
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(otherUser) });

      await expect(service.linkEmail(USER_ID, EMAIL, PASSWORD)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when the current user already has an email linked', async () => {
      const savedUser = makeSavedUser('testpublic1', [], { email: 'existing@example.com' });
      // No conflict with another user
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await expect(service.linkEmail(USER_ID, EMAIL, PASSWORD)).rejects.toThrow(
        ConflictException,
      );
    });

    it('queries the conflict check with the normalized (lowercase) email', async () => {
      const savedUser = makeSavedUser('testpublic1');
      mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(savedUser) });

      await service.linkEmail(USER_ID, 'MiXeD@ExAmPlE.CoM', PASSWORD);

      const findOneArg = mockFindOne.mock.calls[0]![0] as Record<string, unknown>;
      expect(findOneArg['email']).toBe('mixed@example.com');
    });
  });

  // ── restore ────────────────────────────────────────────────────────────────

  describe('restore()', () => {
    const CALLER_USER_ID = '507f1f77bcf86cd799439000';
    const TARGET_USER_ID = '507f1f77bcf86cd799439011';
    const GOOGLE_ID_TOKEN = 'valid.google.id.token';
    const GOOGLE_SUB = 'google-sub-restore-123';

    function makeGoogleTicket(sub: string) {
      return { getPayload: () => ({ sub }) };
    }

    /** Helper: reset the JWT sign mock with deterministic token values */
    function resetSignMock() {
      mockJwtSignAsync
        .mockReset()
        .mockResolvedValueOnce('restore-access-token')
        .mockResolvedValueOnce('restore-refresh-token');
    }

    // ── Google restore ──────────────────────────────────────────────────────

    describe('via Google ID token', () => {
      it('happy path: finds user by googleId and returns tokens for the target account', async () => {
        const targetUser = makeSavedUser('targetpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          googleId: GOOGLE_SUB,
        });
        // Caller's anonymous account (different user, untouched)
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
        });

        mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));
        // findOne returns target (for google lookup)
        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(targetUser) });
        // findById for caller's delete check
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        resetSignMock();

        const result = await service.restore(CALLER_USER_ID, { googleIdToken: GOOGLE_ID_TOKEN });

        expect(result.accessToken).toBe('restore-access-token');
        expect(result.refreshToken).toBe('restore-refresh-token');
        expect(result.user.publicId).toBe('targetpublic1');
      });

      it('throws UnauthorizedException when the Google ID token is invalid', async () => {
        mockVerifyIdToken.mockRejectedValue(new Error('invalid token'));
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { googleIdToken: 'bad.token' }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws UnauthorizedException when no account is linked to the Google account', async () => {
        mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));
        // No user found for this googleId
        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { googleIdToken: GOOGLE_ID_TOKEN }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    // ── Email + password restore ────────────────────────────────────────────

    describe('via email + password', () => {
      const EMAIL = 'owner@example.com';
      const PASSWORD = 'correctpassword123';

      it('happy path: finds user by email (verified) and returns tokens', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('emailpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          email: EMAIL,
          emailVerified: true,
          passwordHash: '$argon2id$stored-hash',
        });
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
        });

        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(targetUser) });
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        resetSignMock();

        const result = await service.restore(CALLER_USER_ID, { email: EMAIL, password: PASSWORD });

        expect(result.user.publicId).toBe('emailpublic1');
        expect(result.accessToken).toBe('restore-access-token');
      });

      it('throws UnauthorizedException when the password is wrong', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(false);

        const targetUser = makeSavedUser('emailpublic1', [], {
          email: EMAIL,
          emailVerified: true,
          passwordHash: '$argon2id$stored-hash',
        });

        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(targetUser) });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { email: EMAIL, password: 'wrongpassword' }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws UnauthorizedException when email is not verified', async () => {
        const targetUser = makeSavedUser('emailpublic1', [], {
          email: EMAIL,
          emailVerified: false,
          passwordHash: '$argon2id$stored-hash',
        });

        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(targetUser) });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { email: EMAIL, password: PASSWORD }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws UnauthorizedException when no user is found for the email', async () => {
        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { email: 'nobody@example.com', password: PASSWORD }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    // ── Recovery code restore ───────────────────────────────────────────────

    describe('via recovery code', () => {
      const FORMATTED_CODE = 'ab3cd-ef7gh-jk9mn-pq2rs';
      const RAW_CODE = 'ab3cdef7ghjk9mnpq2rs';

      it('happy path: finds user, clears recoveryCodeHash, returns tokens', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('recovpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          recoveryCodeHash: '$argon2id$code-hash',
        });
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([targetUser]) }),
        });
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        resetSignMock();

        const result = await service.restore(CALLER_USER_ID, { recoveryCode: FORMATTED_CODE });

        expect(result.user.publicId).toBe('recovpublic1');
        // Recovery code hash must be cleared (single-use)
        expect(targetUser.recoveryCodeHash).toBeUndefined();
        expect(targetUser.save).toHaveBeenCalled();
      });

      it('strips dashes from the formatted recovery code before verifying', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockClear();
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('recovpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          recoveryCodeHash: '$argon2id$code-hash',
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([targetUser]) }),
        });
        mockFindById.mockReturnValue({
          exec: jest.fn().mockResolvedValue(
            makeSavedUser('callerpublic1', [], { _id: { toString: () => CALLER_USER_ID } }),
          ),
        });
        resetSignMock();

        await service.restore(CALLER_USER_ID, { recoveryCode: FORMATTED_CODE });

        // argon2.verify should have been called with the raw code (no dashes)
        const verifyArg = argon2Mock.verify.mock.calls[0]![1] as string;
        expect(verifyArg).toBe(RAW_CODE);
        expect(verifyArg).not.toContain('-');
      });

      it('throws UnauthorizedException when no code matches', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(false);

        const candidate = makeSavedUser('recovpublic1', [], {
          recoveryCodeHash: '$argon2id$code-hash',
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([candidate]) }),
        });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { recoveryCode: 'wrong-wrong-wrong-wrong' }),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('throws UnauthorizedException when there are no candidates at all', async () => {
        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
        });
        resetSignMock();

        await expect(
          service.restore(CALLER_USER_ID, { recoveryCode: FORMATTED_CODE }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    // ── Anonymous account cleanup ───────────────────────────────────────────

    describe('anonymous account cleanup', () => {
      it("soft-deletes the caller's anonymous account when it is untouched", async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('targetpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          recoveryCodeHash: '$argon2id$code-hash',
        });
        // Untouched caller: no fullName, no customName
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
          fullName: undefined,
          customName: undefined,
          status: 'active',
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([targetUser]) }),
        });
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        mockLinkCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
        mockCardCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
        resetSignMock();

        await service.restore(CALLER_USER_ID, { recoveryCode: 'ab3cd-ef7gh-jk9mn-pq2rs' });

        // Caller's account must be soft-deleted
        expect(callerUser.status).toBe('deleted');
        expect(callerUser.save).toHaveBeenCalled();
      });

      it('does NOT delete the caller account when it has links', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('targetpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          recoveryCodeHash: '$argon2id$code-hash',
        });
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
          status: 'active',
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([targetUser]) }),
        });
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        mockLinkCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(2) });
        mockCardCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
        resetSignMock();

        await service.restore(CALLER_USER_ID, { recoveryCode: 'ab3cd-ef7gh-jk9mn-pq2rs' });

        expect(callerUser.status).toBe('active');
      });

      it('does NOT delete the caller account when it has bound cards', async () => {
        const argon2Mock = jest.requireMock('argon2') as { verify: jest.Mock };
        argon2Mock.verify.mockResolvedValue(true);

        const targetUser = makeSavedUser('targetpublic1', [], {
          _id: { toString: () => TARGET_USER_ID },
          recoveryCodeHash: '$argon2id$code-hash',
        });
        const callerUser = makeSavedUser('callerpublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
          status: 'active',
        });

        mockFind.mockReturnValue({
          limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([targetUser]) }),
        });
        mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(callerUser) });
        mockLinkCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
        mockCardCountDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
        resetSignMock();

        await service.restore(CALLER_USER_ID, { recoveryCode: 'ab3cd-ef7gh-jk9mn-pq2rs' });

        expect(callerUser.status).toBe('active');
      });

      it('does NOT delete the caller account when callerUserId === targetUserId', async () => {
        // Same user restoring themselves via Google (account already has it linked)
        const sameUser = makeSavedUser('samepublic1', [], {
          _id: { toString: () => CALLER_USER_ID },
          googleId: GOOGLE_SUB,
          status: 'active',
        });

        mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(GOOGLE_SUB));
        mockFindOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(sameUser) });
        resetSignMock();

        await service.restore(CALLER_USER_ID, { googleIdToken: GOOGLE_ID_TOKEN });

        // Status stays active — no cleanup triggered
        expect(sameUser.status).toBe('active');
      });
    });

    // ── BadRequestException when no method provided ─────────────────────────

    it('throws BadRequestException when no restore method is provided', async () => {
      const { BadRequestException } = await import('@nestjs/common');

      await expect(
        service.restore(CALLER_USER_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

// ---------------------------------------------------------------------------
// Local type aliases used only in test assertions
// ---------------------------------------------------------------------------

interface AccessPayload {
  sub: string;
  publicId: string;
  type: string;
}

interface RefreshPayload {
  sub: string;
  tokenId: string;
  type: string;
}

interface SignOptions {
  secret: string;
  expiresIn: string;
}
