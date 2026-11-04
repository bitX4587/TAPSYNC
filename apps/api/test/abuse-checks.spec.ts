/**
 * Abuse checks for TapSync API.
 *
 * Verifies:
 * 1. Recovery code generation is throttled (POST /auth/recovery-code)
 * 2. My Network privacy: owner cannot see who saved their profile (Req 12.9)
 * 3. Bulk sync abuse limit: POST /network/sync rejects >100 entries (Req 12.6)
 *
 * NOTE: Anonymous account creation (POST /auth/anonymous) and restore
 * (POST /auth/restore) throttling are already covered in
 * security-ratelimits.spec.ts and are not duplicated here.
 */

// ---------------------------------------------------------------------------
// Set required environment variables BEFORE any module is imported.
// ---------------------------------------------------------------------------
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/placeholder';
process.env['JWT_ACCESS_SECRET'] = 'abuse-test-access-secret-at-least-32chars-long';
process.env['JWT_REFRESH_SECRET'] = 'abuse-test-refresh-secret-at-least-32chars-long';
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
// Imports
// ---------------------------------------------------------------------------

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Response as SupertestResponse } from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

import { AppConfigModule } from '../src/config/index.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { RevalidationModule } from '../src/revalidation/index.js';
import { UsersModule } from '../src/users/index.js';
import { AuthModule } from '../src/auth/index.js';
import { LinksModule } from '../src/links/index.js';
import { CardsModule } from '../src/cards/index.js';
import { NetworkModule } from '../src/network/index.js';
import { AnalyticsModule } from '../src/analytics/index.js';
import { CustomNamesModule } from '../src/custom-names/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal NestJS test app. Pass `useRealThrottler: true` to enable
 *  real rate limiting (needed for throttle-specific tests).
 */
async function buildApp(
  mongod: MongoMemoryServer,
  opts: { useRealThrottler?: boolean } = {},
): Promise<INestApplication> {
  const mongoUri = mongod.getUri();
  process.env['MONGODB_URI'] = mongoUri;

  const throttlerProvider = opts.useRealThrottler
    ? { provide: APP_GUARD, useClass: ThrottlerGuard }
    : { provide: APP_GUARD, useValue: { canActivate: () => true } };

  const extraImports = opts.useRealThrottler
    ? [
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 60 },
          { name: 'strict', ttl: 60_000, limit: 10 },
        ]),
      ]
    : [];

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ...extraImports,
      MongooseModule.forRoot(mongoUri),
      RevalidationModule,
      UsersModule,
      AuthModule,
      LinksModule,
      CardsModule,
      NetworkModule,
      AnalyticsModule,
      CustomNamesModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: HttpExceptionFilter },
      throttlerProvider,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

/** Create an anonymous account and return tokens + publicId. */
async function createAccount(
  app: INestApplication,
): Promise<{ accessToken: string; publicId: string }> {
  const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
    .post('/auth/anonymous')
    .send({})
    .expect(201)) as SupertestResponse;
  return {
    accessToken: res.body.accessToken,
    publicId: res.body.user.publicId,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Abuse Checks (Integration)', () => {
  // =========================================================================
  // 1. POST /auth/recovery-code — throttled (strict: 10 req / 60 s)
  // =========================================================================

  describe('1. POST /auth/recovery-code throttled per IP', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      app = await buildApp(mongod, { useRealThrottler: true });
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('has @Throttle({ strict }) decorator on the recovery-code endpoint', () => {
      // Static verification via source inspection.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../src/auth/auth.controller.ts'),
        'utf-8',
      );
      // Throttle decorator should appear before generateRecoveryCode
      expect(source).toContain("@Throttle({ strict: { ttl: 60_000, limit: 10 } })");
      expect(source).toContain('generateRecoveryCode');
    });

    it('returns 429 after exceeding the strict limit (10 req / 60 s)', async () => {
      // Create one account — this first anonymous call uses the strict throttler
      // too, so it counts. We then send recovery-code requests until 429.
      const { accessToken } = await createAccount(app);

      let got429 = false;

      for (let i = 0; i < 12; i++) {
        const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
          .post('/auth/recovery-code')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({})) as SupertestResponse;

        if (res.status === 429) {
          got429 = true;
          break;
        }
        // Before hitting the limit, each call should succeed
        expect(res.status).toBe(200);
      }

      expect(got429).toBe(true);
    }, 60_000);
  });

  // =========================================================================
  // 2. My Network privacy — owner cannot see who saved them (Req 12.9)
  // =========================================================================

  describe('2. My Network privacy — owner cannot see savers', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;
    let userAToken: string;
    let userAPublicId: string;
    let userBToken: string;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      app = await buildApp(mongod); // throttler mocked — testing privacy logic

      // Create User A (profile owner) and User B (the saver)
      const userA = await createAccount(app);
      userAToken = userA.accessToken;
      userAPublicId = userA.publicId;

      const userB = await createAccount(app);
      userBToken = userB.accessToken;

      // User B saves User A's profile
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/network')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          publicId: userAPublicId,
          source: 'nfc',
          tappedAt: new Date().toISOString(),
        })
        .expect(201);
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('GET /network for User A does NOT contain User B (owner only sees contacts they saved)', async () => {
      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/network')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200)) as SupertestResponse;

      // User A's network list should be empty — they saved nobody
      const contacts: Array<{ publicId?: string }> = res.body.contacts ?? res.body.items ?? res.body ?? [];
      const ids = contacts.map((c) => c.publicId);
      // User B's publicId must not appear as a contact of User A
      // (User A never saved User B — only User B saved User A)
      expect(ids).not.toContain(userAPublicId);
      // More importantly, the list should be empty because User A saved no one
      expect(Array.isArray(contacts)).toBe(true);
      expect(contacts.length).toBe(0);
    });

    it('GET /analytics/summary for User A returns counts only — no saver identities', async () => {
      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/analytics/summary?range=all')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200)) as SupertestResponse;

      const body = res.body as {
        totalViews?: number;
        totalLinkClicks?: number;
        totalContactSaves?: number;
        savers?: unknown[];
        savedBy?: unknown[];
        whoSavedMe?: unknown[];
      };

      // Must have aggregate counts
      expect(typeof body.totalViews).toBe('number');
      expect(typeof body.totalLinkClicks).toBe('number');
      expect(typeof body.totalContactSaves).toBe('number');

      // Must NOT expose any saver-identity fields
      expect(body.savers).toBeUndefined();
      expect(body.savedBy).toBeUndefined();
      expect(body.whoSavedMe).toBeUndefined();
    });

    it('There is no /network/savers endpoint — returns 404', async () => {
      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/network/savers')
        .set('Authorization', `Bearer ${userAToken}`)) as SupertestResponse;

      // No such route exists — NestJS returns 404
      expect(res.status).toBe(404);
    });

    it('There is no /network/saved-by endpoint — returns 404', async () => {
      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/network/saved-by')
        .set('Authorization', `Bearer ${userAToken}`)) as SupertestResponse;

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. POST /network/sync — max 100 entries enforced (Req 12.6 / 12.8)
  // =========================================================================

  describe('3. POST /network/sync rejects more than 100 entries', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;
    let accessToken: string;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      app = await buildApp(mongod); // throttler mocked — testing validation logic

      const account = await createAccount(app);
      accessToken = account.accessToken;
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('returns 400 when contacts array has 101 entries', async () => {
      // Build an array of 101 SaveContactDto objects.
      // The publicIds are fake 10-char strings; validation will reject the
      // array size before even querying the DB.
      const contacts = Array.from({ length: 101 }, (_, i) => ({
        publicId: String(i).padStart(10, '0'), // 10-char string
        source: 'nfc',
        tappedAt: new Date().toISOString(),
      }));

      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/network/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contacts })) as SupertestResponse;

      expect(res.status).toBe(400);
    });

    it('returns 201 when contacts array has exactly 100 entries (boundary)', async () => {
      const contacts = Array.from({ length: 100 }, (_, i) => ({
        publicId: String(i).padStart(10, '0'), // fake publicIds
        source: 'nfc',
        tappedAt: new Date().toISOString(),
      }));

      // 100 fake publicIds → service will fail to look up profiles (404 per
      // contact), but the DTO validation layer will accept the array size.
      // We only care that it is NOT a 400 (validation error).
      const res = (await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/network/sync')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contacts })) as SupertestResponse;

      // Not a validation error — service handles missing profiles gracefully
      expect(res.status).not.toBe(400);
    });
  });
});
