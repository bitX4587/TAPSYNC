/**
 * Integration tests for the AuthController / AuthService
 *
 * Uses a real in-memory MongoDB via mongodb-memory-server, a real NestJS
 * TestingModule, and Supertest for HTTP assertions. JWT signing uses real
 * secrets (no mocks), argon2 is real (no mock), and google-auth-library is
 * module-level-mocked so tests do not hit Google's servers.
 *
 * Covers: Req 1.1–1.13, 2.1, 2.2
 *
 * Test matrix:
 *  1. First open         – POST /auth/anonymous returns 201 with correct shape
 *  2. Silent re-login    – POST /auth/refresh rotates the token pair
 *  3. Refresh reuse      – second use of a superseded token → 401 + all revoked
 *  4. Logout             – POST /auth/logout, refresh afterwards → 401
 *  5. Link Google        – happy path + conflict on duplicate googleId
 *  6. Link email         – happy path + two conflict cases
 *  7. Restore via Google – happy path + anonymous cleanup + nonexistent account
 *  8. Restore via email+password – happy path + anonymous cleanup + wrong credentials
 *  9. Restore via recovery code – happy path + single-use enforcement
 *  10. Throttling        – 11th request to POST /auth/anonymous → 429
 */

// ---------------------------------------------------------------------------
// Set required environment variables BEFORE any module is imported.
// ConfigModule.forRoot({ validate }) reads process.env at module-compile time
// (inside beforeAll → Test.createTestingModule().compile()). These values must
// exist so validation passes; the MongoDB URI placeholder is overridden below
// once MongoMemoryServer has started.
// ---------------------------------------------------------------------------
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/placeholder';
process.env['JWT_ACCESS_SECRET'] = 'integration-test-access-secret-at-least-32chars';
process.env['JWT_REFRESH_SECRET'] = 'integration-test-refresh-secret-at-least-32chars';
process.env['JWT_ACCESS_EXPIRES_IN'] = '15m';
process.env['JWT_REFRESH_EXPIRES_IN'] = '365d';
process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id';
process.env['REVALIDATION_SECRET'] = 'test-revalidation-secret';
process.env['NEXT_PUBLIC_URL'] = 'http://localhost:3000';
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
delete process.env['PLAY_INTEGRITY_ENABLED'];
process.env['STORAGE_BUCKET'] = 'test-bucket';
process.env['STORAGE_KEY_ID'] = 'test-key-id';
process.env['STORAGE_SECRET'] = 'test-storage-secret';
process.env['STORAGE_REGION'] = 'us-east-1';

// ---------------------------------------------------------------------------
// Mock google-auth-library at the module level (before any NestJS imports)
// ---------------------------------------------------------------------------

const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after env vars are set so ConfigModule.forRoot validation passes)
// ---------------------------------------------------------------------------

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Response as SupertestResponse } from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

import { AppConfigModule } from '../config/index.js';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter.js';
import { CommonModule } from '../common/index.js';
import { LinksModule } from '../links/index.js';
import { UsersModule } from '../users/index.js';
import { CardsModule } from '../cards/index.js';
import { AuthModule } from './auth.module.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUBLIC_ID_REGEX = /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/;

// ---------------------------------------------------------------------------
// Helper: build a Google ticket stub
// ---------------------------------------------------------------------------

function makeGoogleTicket(sub: string) {
  return {
    getPayload: () => ({ sub }),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Auth Endpoints (Integration)', () => {
  let mongod: MongoMemoryServer;
  let app: INestApplication;

  // ── Shared helpers ─────────────────────────────────────────────────────────

  /** Create an anonymous account and return the full response body. */
  async function createAnonymousAccount() {
    const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
      .post('/auth/anonymous')
      .send({}) as SupertestResponse;
    expect(res.status).toBe(201);
    return res.body as {
      accessToken: string;
      refreshToken: string;
      user: { publicId: string };
    };
  }

  // ── Global setup/teardown ──────────────────────────────────────────────────

  beforeAll(async () => {
    // Start in-memory MongoDB — first run downloads the binary (~780 MB).
    // Subsequent runs use the cached binary and are fast.
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    // Update the env var so AppConfigService returns the real URI too
    process.env['MONGODB_URI'] = mongoUri;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        // AppConfigModule must be first: it's @Global and provides AppConfigService
        AppConfigModule,
        // Use the MongoMemoryServer URI directly (bypasses AppConfigService.mongodbUri)
        MongooseModule.forRoot(mongoUri),
        UsersModule,
        LinksModule,
        CardsModule,
        AuthModule,
      ],
      providers: [
        // Apply the exception filter to every route in the application
        {
          provide: APP_FILTER,
          useClass: HttpExceptionFilter,
        },
        // Mock throttler to always allow requests (tested separately in section 10)
        {
          provide: APP_GUARD,
          useValue: {
            canActivate: () => true,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Apply the same ValidationPipe as in the real main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  }, 300_000); // allow up to 5 minutes for first-time MongoDB binary download

  afterAll(async () => {
    if (app) await app.close();
    if (mongod) await mongod.stop();
  });

  beforeEach(() => {
    mockVerifyIdToken.mockReset();
  });

  // =========================================================================
  // 1. First open
  // =========================================================================

  describe('1. First open – POST /auth/anonymous', () => {
    it('returns 201 with accessToken, refreshToken and user.publicId', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/anonymous')
        .send({})
        .expect(201) as SupertestResponse;
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { publicId: expect.any(String) },
      });
    });

    it('publicId is 10 characters from the look-alike-free alphabet', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/anonymous')
        .send({})
        .expect(201) as SupertestResponse;

      expect(res.body.user.publicId).toMatch(PUBLIC_ID_REGEX);
    });

    it('each call creates a distinct user with a unique publicId', async () => {
      const [a, b] = await Promise.all([
        createAnonymousAccount(),
        createAnonymousAccount(),
      ]);

      expect(a.user.publicId).not.toBe(b.user.publicId);
    });

    it('tokens are non-empty JWTs (three dot-separated segments)', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/anonymous')
        .send({})
        .expect(201) as SupertestResponse;

      const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
      expect(res.body.accessToken).toMatch(jwtPattern);
      expect(res.body.refreshToken).toMatch(jwtPattern);
    });
  });

  // =========================================================================
  // 2. Silent re-login (refresh)
  // =========================================================================

  describe('2. Silent re-login – POST /auth/refresh', () => {
    it('returns 200 with a new accessToken and refreshToken', async () => {
      const { refreshToken } = await createAnonymousAccount();

      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200) as SupertestResponse;

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('new accessToken is different from the original', async () => {
      const { accessToken, refreshToken } = await createAnonymousAccount();

      // Wait 1 second to ensure the new token has a different 'iat' timestamp
      await new Promise(resolve => setTimeout(resolve, 1000));

      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200) as SupertestResponse;

      expect(res.body.accessToken).not.toBe(accessToken);
    });

    it('new refreshToken is different from the original', async () => {
      const { refreshToken } = await createAnonymousAccount();

      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200) as SupertestResponse;

      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('old refresh token can no longer be used after rotation', async () => {
      const { refreshToken: originalToken } = await createAnonymousAccount();

      // Consume the original token
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: originalToken })
        .expect(200);

      // Original token is now stale — must be rejected
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: originalToken })
        .expect(401);
    });

    it('returns 401 for a completely invalid token string', async () => {
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: 'not.a.valid.jwt' })
        .expect(401);
    });
  });

  // =========================================================================
  // 3. Refresh token reuse detection
  // =========================================================================

  describe('3. Refresh token reuse – POST /auth/refresh', () => {
    it('second use of a superseded token returns 401', async () => {
      const { refreshToken: rt0 } = await createAnonymousAccount();

      // First rotation: rt0 → rt1
      const res1 = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt0 })
        .expect(200) as SupertestResponse;

      const rt1: string = res1.body.refreshToken;

      // Second rotation: rt1 → rt2 (valid)
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt1 })
        .expect(200);

      // Attempt reuse of rt0 — should be rejected (token family revoked)
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt0 })
        .expect(401);
    });

    it('after reuse detection, even the newest token is revoked', async () => {
      const { refreshToken: rt0 } = await createAnonymousAccount();

      // rt0 → rt1
      const res1 = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt0 })
        .expect(200) as SupertestResponse;
      const rt1: string = res1.body.refreshToken;

      // Trigger reuse: send rt0 again — this should revoke the whole family
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt0 })
        .expect(401);

      // Now rt1 (the current token) should also be revoked
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: rt1 })
        .expect(401);
    });
  });

  // =========================================================================
  // 4. Logout
  // =========================================================================

  describe('4. Logout – POST /auth/logout', () => {
    it('returns 204 on successful logout', async () => {
      const { refreshToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(204);
    });

    it('refresh after logout returns 401', async () => {
      const { refreshToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(204);

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('logout with an already-invalid token still returns 204 (idempotent)', async () => {
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/logout')
        .send({ refreshToken: 'totally.invalid.jwt' })
        .expect(204);
    });
  });

  // =========================================================================
  // 5. Link Google
  // =========================================================================

  describe('5. Link Google – POST /auth/link/google', () => {
    it('returns 200 when a Google account is linked successfully', async () => {
      const { accessToken } = await createAnonymousAccount();

      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket('google-sub-unique-1'));

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ idToken: 'fake-google-id-token' })
        .expect(200);
    });

    it('returns 401 when no Authorization header is provided', async () => {
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket('google-sub-unique-2'));

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .send({ idToken: 'fake-google-id-token' })
        .expect(401);
    });

    it('returns 409 when the same Google account is linked to a second user', async () => {
      const [user1, user2] = await Promise.all([
        createAnonymousAccount(),
        createAnonymousAccount(),
      ]);

      const googleSub = 'google-sub-conflict-test';

      // Link to user1 first
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ idToken: 'fake-token-1' })
        .expect(200);

      // Attempt to link the same Google sub to user2
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ idToken: 'fake-token-2' })
        .expect(409);
    });

    it('returns 409 when the same user tries to link a second Google account', async () => {
      const { accessToken } = await createAnonymousAccount();

      // First link
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket('google-sub-first-link'));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ idToken: 'fake-token-A' })
        .expect(200);

      // Second link attempt on the same user
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket('google-sub-second-link'));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ idToken: 'fake-token-B' })
        .expect(409);
    });
  });

  // =========================================================================
  // 6. Link email
  // =========================================================================

  describe('6. Link email – POST /auth/link/email', () => {
    it('returns 200 when email + password is linked successfully', async () => {
      const { accessToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'alice@example.com', password: 'Password123!' })
        .expect(200);
    });

    it('returns 401 when no Authorization header is provided', async () => {
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .send({ email: 'noaccess@example.com', password: 'Password123!' })
        .expect(401);
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      const { accessToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'shortpw@example.com', password: 'abc' })
        .expect(400);
    });

    it('returns 409 when the same email is linked to a second user', async () => {
      const [user1, user2] = await Promise.all([
        createAnonymousAccount(),
        createAnonymousAccount(),
      ]);

      const email = 'conflict-email@example.com';

      // Link to user1
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ email, password: 'Password123!' })
        .expect(200);

      // Attempt to link the same email to user2
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ email, password: 'DifferentPassword1!' })
        .expect(409);
    });

    it('returns 409 when the same user tries to link a second email', async () => {
      const { accessToken } = await createAnonymousAccount();

      // First link
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'first-link@example.com', password: 'Password123!' })
        .expect(200);

      // Second link attempt on the same user
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'second-link@example.com', password: 'Password123!' })
        .expect(409);
    });
  });

  // =========================================================================
  // 7. Restore via Google
  // =========================================================================

  describe('7. Restore via Google – POST /auth/restore', () => {
    it('returns 200 with tokens for the original account', async () => {
      // user1 creates their account and links Google
      const user1 = await createAnonymousAccount();
      const googleSub = 'google-sub-restore-test-1';

      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ idToken: 'fake-google-id-token' })
        .expect(200);

      // user2 is on a new phone (fresh anonymous account)
      const user2 = await createAnonymousAccount();

      // user2 restores user1's account using the same Google account
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      const restoreRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ googleIdToken: 'fake-google-id-token-restore' })
        .expect(200) as SupertestResponse;

      expect(restoreRes.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { publicId: user1.user.publicId },
      });
    });

    it('deletes the untouched anonymous account after restore', async () => {
      // user1 creates account and links Google
      const user1 = await createAnonymousAccount();
      const googleSub = 'google-sub-restore-test-2';

      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/google')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ idToken: 'fake-google-id-token' })
        .expect(200);

      // user2 creates a new anonymous account (untouched: no links, no cards, no name)
      const user2 = await createAnonymousAccount();

      // Restore user1's account from user2's session
      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket(googleSub));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ googleIdToken: 'fake-google-id-token-restore' })
        .expect(200);

      // Verify user2's anonymous account tokens no longer work
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: user2.refreshToken })
        .expect(401);
    });

    it('returns 401 when Google account is not linked to any user', async () => {
      const user = await createAnonymousAccount();

      mockVerifyIdToken.mockResolvedValue(makeGoogleTicket('google-sub-nonexistent'));
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ googleIdToken: 'fake-google-id-token' })
        .expect(401);
    });
  });

  // =========================================================================
  // 8. Restore via email+password
  // =========================================================================

  describe('8. Restore via email+password – POST /auth/restore', () => {
    it('returns 200 with tokens for the original account', async () => {
      // user1 creates their account and links email
      const user1 = await createAnonymousAccount();
      const email = 'restore-test@example.com';
      const password = 'RestorePassword123!';

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ email, password })
        .expect(200);

      // Manually verify email (since verification endpoint is not implemented yet)
      // This is necessary for restore to work
      const User = app.get('UserModel');
      await User.updateOne({ publicId: user1.user.publicId }, { emailVerified: true });

      // user2 is on a new phone (fresh anonymous account)
      const user2 = await createAnonymousAccount();

      // user2 restores user1's account using email+password
      const restoreRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ email, password })
        .expect(200) as SupertestResponse;

      expect(restoreRes.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { publicId: user1.user.publicId },
      });
    });

    it('deletes the untouched anonymous account after restore', async () => {
      // user1 creates account and links email
      const user1 = await createAnonymousAccount();
      const email = 'restore-test-2@example.com';
      const password = 'RestorePassword123!';

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ email, password })
        .expect(200);

      // Manually verify email
      const User = app.get('UserModel');
      await User.updateOne({ publicId: user1.user.publicId }, { emailVerified: true });

      // user2 creates a new anonymous account (untouched)
      const user2 = await createAnonymousAccount();

      // Restore user1's account from user2's session
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ email, password })
        .expect(200);

      // Verify user2's anonymous account tokens no longer work
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/refresh')
        .send({ refreshToken: user2.refreshToken })
        .expect(401);
    });

    it('returns 401 when email does not exist', async () => {
      const user = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ email: 'nonexistent@example.com', password: 'SomePassword123!' })
        .expect(401);
    });

    it('returns 401 when password is incorrect', async () => {
      // user1 creates account and links email
      const user1 = await createAnonymousAccount();
      const email = 'restore-wrong-pw@example.com';
      const password = 'CorrectPassword123!';

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/link/email')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ email, password })
        .expect(200);

      // Manually verify email
      const User = app.get('UserModel');
      await User.updateOne({ publicId: user1.user.publicId }, { emailVerified: true });

      // user2 tries to restore with wrong password
      const user2 = await createAnonymousAccount();
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ email, password: 'WrongPassword123!' })
        .expect(401);
    });
  });

  // =========================================================================
  // 9. Restore via recovery code
  // =========================================================================

  describe('9. Restore via recovery code – POST /auth/restore', () => {
    /**
     * Generate a recovery code for user1, then use it from user2's session to
     * restore user1's account. Real Argon2id is used — slower but more correct.
     */
    it('returns 200 with tokens for the original account', async () => {
      // user1 creates their account and generates a recovery code
      const user1 = await createAnonymousAccount();
      const codeRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/recovery-code')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send()
        .expect(200) as SupertestResponse;

      expect(codeRes.body.code).toMatch(
        /^[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}-[23456789abcdefghjkmnpqrstuvwxyz]{5}$/,
      );

      const recoveryCode: string = codeRes.body.code;

      // user2 is on a new phone (fresh anonymous account)
      const user2 = await createAnonymousAccount();

      // user2 restores user1's account using the recovery code
      const restoreRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ recoveryCode })
        .expect(200) as SupertestResponse;

      expect(restoreRes.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { publicId: user1.user.publicId },
      });
    }, 30_000);

    it('recovery code is single-use: second restore attempt returns 401', async () => {
      // Create user1 and a recovery code
      const user1 = await createAnonymousAccount();
      const codeRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/recovery-code')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send()
        .expect(200) as SupertestResponse;

      const recoveryCode: string = codeRes.body.code;

      // First restore: should succeed
      const user2 = await createAnonymousAccount();
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ recoveryCode })
        .expect(200);

      // Second restore attempt with the same code: must fail
      const user3 = await createAnonymousAccount();
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${user3.accessToken}`)
        .send({ recoveryCode })
        .expect(401);
    }, 30_000);

    it('returns 401 for an invalid / random recovery code', async () => {
      const { accessToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ recoveryCode: 'aaaaa-bbbbb-ccccc-ddddd' })
        .expect(401);
    });

    it('returns 400 when no restore method is provided', async () => {
      const { accessToken } = await createAnonymousAccount();

      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/restore')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });

  // =========================================================================
  // 10. Throttling
  // =========================================================================

  describe('10. Throttling – POST /auth/anonymous', () => {
    /**
     * The `strict` throttler on /auth/anonymous allows 10 requests per 60 s.
     * The 11th request in the same window must be rejected with 429.
     *
     * We create a dedicated app with a separate MongoDB for this test so
     * throttler state is isolated from other tests.
     */
    it('returns 429 after the strict limit is reached', async () => {
      // Start a separate in-memory MongoDB for this test
      const throttleMongod = await MongoMemoryServer.create();
      const throttleMongoUri = throttleMongod.getUri();

      try {
        // Build a dedicated NestJS app with the real ThrottlerGuard (strict limits)
        const throttleModuleRef = await Test.createTestingModule({
          imports: [
            AppConfigModule,
            ThrottlerModule.forRoot([
              {
                name: 'default',
                ttl: 60_000,
                limit: 60,
              },
              {
                name: 'strict',
                ttl: 60_000,
                limit: 10,
              },
            ]),
            MongooseModule.forRoot(throttleMongoUri),
            UsersModule,
            LinksModule,
            CardsModule,
            AuthModule,
          ],
          providers: [
            {
              provide: APP_FILTER,
              useClass: HttpExceptionFilter,
            },
            {
              provide: APP_GUARD,
              useClass: ThrottlerGuard,
            },
          ],
        }).compile();

        const throttleApp = throttleModuleRef.createNestApplication();
        throttleApp.useGlobalPipes(
          new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
        );
        await throttleApp.init();

        try {
          let got429 = false;

          // Send up to 12 requests; we expect to hit 429 at the 11th
          for (let i = 0; i < 12; i++) {
            const res = await (request(throttleApp.getHttpServer()) as ReturnType<typeof request>)
              .post('/auth/anonymous')
              .send({}) as SupertestResponse;

            if (res.status === 429) {
              got429 = true;
              break;
            }

            expect(res.status).toBe(201); // only 201 is acceptable before throttling
          }

          expect(got429).toBe(true);
        } finally {
          await throttleApp.close();
        }
      } finally {
        await throttleMongod.stop();
      }
    }, 60_000);
  });
});
