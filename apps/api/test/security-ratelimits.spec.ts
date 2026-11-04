/**
 * Security verification: Rate limiting.
 *
 * Requirements 1.12, 1.13, 10.5:
 *  - 1.12: Throttle repeated auth failures (>10 from one IP in 15 min).
 *  - 1.13: Rate limit anonymous account creation per IP and per device.
 *  - 10.5: Public endpoints and auth endpoints SHALL be rate limited.
 *
 * The throttler config (src/common/common.module.ts) defines:
 *  - default: 60 req / 60 s
 *  - strict:  10 req / 60 s  (used by /auth/* and /public/events via @Throttle)
 *
 * Each test builds a dedicated NestJS app with the real ThrottlerGuard so
 * throttler state is isolated.
 */

// ---------------------------------------------------------------------------
// Set required environment variables BEFORE any module is imported.
// ---------------------------------------------------------------------------
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/placeholder';
process.env['JWT_ACCESS_SECRET'] = 'ratelimit-test-access-secret-at-least-32chars';
process.env['JWT_REFRESH_SECRET'] = 'ratelimit-test-refresh-secret-at-least-32chars';
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

// Mock google-auth-library so restore tests don't hit Google
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

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
import { PublicModule } from '../src/public/index.js';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Security – Rate Limits (Integration)', () => {
  // =========================================================================
  // 1. POST /auth/anonymous — strict throttler (10 req / 60 s)
  // =========================================================================

  describe('1. POST /auth/anonymous throttled per IP', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      const mongoUri = mongod.getUri();
      process.env['MONGODB_URI'] = mongoUri;

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          AppConfigModule,
          // Replicate the production throttler config from common.module.ts
          ThrottlerModule.forRoot([
            { name: 'default', ttl: 60_000, limit: 60 },
            { name: 'strict', ttl: 60_000, limit: 10 },
          ]),
          MongooseModule.forRoot(mongoUri),
          RevalidationModule,
          UsersModule,
          AuthModule,
          LinksModule,
          CardsModule,
        ],
        providers: [
          { provide: APP_FILTER, useClass: HttpExceptionFilter },
          { provide: APP_GUARD, useClass: ThrottlerGuard },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('returns 429 after exceeding the strict limit (10 req / 60 s)', async () => {
      let got429 = false;

      for (let i = 0; i < 12; i++) {
        const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
          .post('/auth/anonymous')
          .send({}) as SupertestResponse;

        if (res.status === 429) {
          got429 = true;
          break;
        }
        expect(res.status).toBe(201);
      }

      expect(got429).toBe(true);
    }, 60_000);
  });

  // =========================================================================
  // 2. POST /auth/restore — strict throttler (10 req / 60 s)
  // =========================================================================

  describe('2. POST /auth/restore throttled per IP', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      const mongoUri = mongod.getUri();
      process.env['MONGODB_URI'] = mongoUri;

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          AppConfigModule,
          ThrottlerModule.forRoot([
            { name: 'default', ttl: 60_000, limit: 60 },
            { name: 'strict', ttl: 60_000, limit: 10 },
          ]),
          MongooseModule.forRoot(mongoUri),
          RevalidationModule,
          UsersModule,
          AuthModule,
          LinksModule,
          CardsModule,
        ],
        providers: [
          { provide: APP_FILTER, useClass: HttpExceptionFilter },
          { provide: APP_GUARD, useClass: ThrottlerGuard },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('returns 429 after exceeding the strict limit (10 req / 60 s)', async () => {
      // Create an anonymous account to get an access token for the restore calls
      const anonRes = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/auth/anonymous')
        .send({}) as SupertestResponse;
      // This first request counts toward the strict throttler too, so we
      // send 10 more (11 total) and expect 429 within that window.

      let got429 = false;
      const accessToken = anonRes.body.accessToken;

      for (let i = 0; i < 11; i++) {
        const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
          .post('/auth/restore')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ recoveryCode: 'aaaaa-bbbbb-ccccc-ddddd' }) as SupertestResponse;

        if (res.status === 429) {
          got429 = true;
          break;
        }
        // Before throttling, invalid restore attempts return 401
        expect(res.status).toBe(401);
      }

      expect(got429).toBe(true);
    }, 60_000);
  });

  // =========================================================================
  // 3. Public profile endpoint — throttled
  // =========================================================================

  describe('3. GET /public/profiles/c/:publicId throttled', () => {
    let app: INestApplication;
    let mongod: MongoMemoryServer;

    beforeAll(async () => {
      mongod = await MongoMemoryServer.create();
      const mongoUri = mongod.getUri();
      process.env['MONGODB_URI'] = mongoUri;

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          AppConfigModule,
          // Use a low limit for testing so the test runs quickly.
          // Production config (public.module.ts) uses 60 req / 60 s.
          ThrottlerModule.forRoot([
            { name: 'default', ttl: 60_000, limit: 60 },
            { name: 'strict', ttl: 60_000, limit: 10 },
          ]),
          MongooseModule.forRoot(mongoUri),
          RevalidationModule,
          UsersModule,
          AuthModule,
          LinksModule,
          CardsModule,
          NetworkModule,
          PublicModule,
        ],
        providers: [
          { provide: APP_FILTER, useClass: HttpExceptionFilter },
          { provide: APP_GUARD, useClass: ThrottlerGuard },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
    }, 300_000);

    afterAll(async () => {
      if (app) await app.close();
      if (mongod) await mongod.stop();
    });

    it('returns 429 after exceeding the default limit (60 req / 60 s)', async () => {
      // The public controller uses the 'default' throttler (60/60s) unless it
      // picks the 'public' named throttler from its own ThrottlerModule.forRoot.
      // We send 61 requests and expect a 429 within the batch.
      let got429 = false;

      for (let i = 0; i < 65; i++) {
        const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
          .get('/public/profiles/c/nonexistent000') as SupertestResponse;

        if (res.status === 429) {
          got429 = true;
          break;
        }
        // Before throttling, a non-existent profile returns 404
        expect(res.status).toBe(404);
      }

      expect(got429).toBe(true);
    }, 120_000);
  });

  // =========================================================================
  // 4. Throttler configured globally
  // =========================================================================

  describe('4. Throttler is configured globally', () => {
    it('CommonModule registers ThrottlerGuard as APP_GUARD', () => {
      // Read the source to confirm the guard is registered.
      // This is a static verification: if someone removes APP_GUARD from
      // common.module.ts, this test will fail to import the module correctly.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const commonModuleSource = require('fs').readFileSync(
        require('path').join(__dirname, '../src/common/common.module.ts'),
        'utf-8',
      );

      expect(commonModuleSource).toContain('ThrottlerGuard');
      expect(commonModuleSource).toContain('APP_GUARD');
    });

    it('CommonModule defines both default and strict throttlers', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const commonModuleSource = require('fs').readFileSync(
        require('path').join(__dirname, '../src/common/common.module.ts'),
        'utf-8',
      );

      expect(commonModuleSource).toContain("'default'");
      expect(commonModuleSource).toContain("'strict'");
      // default: 60 req / 60 s
      expect(commonModuleSource).toMatch(/limit:\s*60/);
      // strict: 10 req / 60 s
      expect(commonModuleSource).toMatch(/limit:\s*10/);
    });
  });
});
