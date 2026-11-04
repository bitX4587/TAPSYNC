/**
 * Security verification: Ownership checks & authentication guard coverage.
 *
 * Requirement 10.4: Owner-only endpoints SHALL verify that the authenticated
 * user owns the resource being modified.
 * Requirement 10.3: All inputs SHALL be validated and sanitized server-side.
 *
 * This suite uses a real in-memory MongoDB (mongodb-memory-server), real JWT
 * signing (no mocks), and Supertest for HTTP assertions — the same pattern as
 * the per-module integration specs in src/.
 *
 * Verified properties:
 *  1. Every protected endpoint returns 401 when no JWT is supplied (JwtAuthGuard
 *     is applied to all protected routes).
 *  2. Cross-user access is rejected: user A cannot read, modify, or delete user
 *     B's links, network contacts, or cards.
 *  3. The JwtAuthGuard is present on every owner-only controller.
 */

// ---------------------------------------------------------------------------
// Set required environment variables BEFORE any module is imported so
// ConfigModule.forRoot({ validate }) passes.
// ---------------------------------------------------------------------------
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/placeholder';
process.env['JWT_ACCESS_SECRET'] = 'security-test-access-secret-at-least-32chars';
process.env['JWT_REFRESH_SECRET'] = 'security-test-refresh-secret-at-least-32chars';
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
import { CustomNamesModule } from '../src/custom-names/index.js';
import { AnalyticsModule } from '../src/analytics/index.js';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Security – Ownership & Authentication (Integration)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;

  // Tokens for two distinct users
  let userAToken: string;
  let userAPublicId: string;
  let userBToken: string;
  let userBPublicId: string;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    process.env['MONGODB_URI'] = mongoUri;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        MongooseModule.forRoot(mongoUri),
        // RevalidationModule is @Global — provides RevalidationService to LinksService
        RevalidationModule,
        UsersModule,
        AuthModule,
        LinksModule,
        CardsModule,
        NetworkModule,
        CustomNamesModule,
        AnalyticsModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        // Mock the global throttler so it doesn't interfere with rapid requests
        { provide: APP_GUARD, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 300_000);

  afterAll(async () => {
    if (app) await app.close();
    if (mongod) await mongod.stop();
  });

  // ── Helper ──────────────────────────────────────────────────────────────────

  /** Create an anonymous account via the real HTTP endpoint and return tokens. */
  async function createAccount(): Promise<{ accessToken: string; publicId: string }> {
    const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
      .post('/auth/anonymous')
      .send({})
      .expect(201) as SupertestResponse;
    return {
      accessToken: res.body.accessToken,
      publicId: res.body.user.publicId,
    };
  }

  // =========================================================================
  // 1. JwtAuthGuard on all protected routes (anonymous → 401)
  // =========================================================================

  describe('1. JwtAuthGuard — anonymous requests rejected with 401', () => {
    // A representative set of protected endpoints across every owner-only controller.
    const protectedEndpoints: Array<{ method: string; path: string; body?: object }> = [
      // Users
      { method: 'GET', path: '/user/me' },
      { method: 'PATCH', path: '/user/me', body: { fullName: 'Test' } },
      { method: 'DELETE', path: '/user/me' },
      { method: 'PATCH', path: '/user/mode', body: { mode: 'casual' } },
      // Custom names
      { method: 'GET', path: '/user/custom-name/available?name=test' },
      { method: 'PUT', path: '/user/custom-name', body: { name: 'testuser1' } },
      { method: 'DELETE', path: '/user/custom-name' },
      // Links
      { method: 'GET', path: '/links' },
      { method: 'POST', path: '/links', body: { title: 'T', url: 'https://x.com', mode: 'work', category: 'custom' } },
      { method: 'PUT', path: '/links/reorder', body: { mode: 'work', orderedIds: [] } },
      // Cards
      { method: 'GET', path: '/cards/program-payload' },
      { method: 'POST', path: '/cards/bind', body: { uid: '04ABCDEF0123' } },
      { method: 'GET', path: '/cards' },
      // Network
      { method: 'GET', path: '/network' },
      { method: 'POST', path: '/network', body: { publicId: 'abc', source: 'link', tappedAt: '2024-01-01T00:00:00Z' } },
      // Analytics (owner queries — POST /analytics/events is public, excluded here)
      { method: 'GET', path: '/analytics/summary' },
      { method: 'GET', path: '/analytics/links' },
      { method: 'GET', path: '/analytics/events' },
      // Auth (protected sub-endpoints)
      { method: 'POST', path: '/auth/link/google', body: { idToken: 'fake' } },
      { method: 'POST', path: '/auth/link/email', body: { email: 'a@b.com', password: 'Password123!' } },
      { method: 'POST', path: '/auth/recovery-code' },
    ];

    for (const endpoint of protectedEndpoints) {
      it(`${endpoint.method} ${endpoint.path} → 401 without token`, async () => {
        const req = request(app.getHttpServer()) as ReturnType<typeof request>;
        let response: SupertestResponse;

        switch (endpoint.method) {
          case 'GET':
            response = await req.get(endpoint.path) as SupertestResponse;
            break;
          case 'POST':
            response = await req.post(endpoint.path).send(endpoint.body ?? {}) as SupertestResponse;
            break;
          case 'PUT':
            response = await req.put(endpoint.path).send(endpoint.body ?? {}) as SupertestResponse;
            break;
          case 'PATCH':
            response = await req.patch(endpoint.path).send(endpoint.body ?? {}) as SupertestResponse;
            break;
          case 'DELETE':
            response = await req.delete(endpoint.path) as SupertestResponse;
            break;
          default:
            throw new Error(`Unknown method: ${endpoint.method}`);
        }

        expect(response.status).toBe(401);
      });
    }

    it('PATCH /links/:id → 401 without token', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch('/links/507f1f77bcf86cd799439011')
        .send({ title: 'hacked' }) as SupertestResponse;
      expect(res.status).toBe(401);
    });

    it('DELETE /links/:id → 401 without token', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete('/links/507f1f77bcf86cd799439011') as SupertestResponse;
      expect(res.status).toBe(401);
    });

    it('DELETE /network/:id → 401 without token', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete('/network/507f1f77bcf86cd799439011') as SupertestResponse;
      expect(res.status).toBe(401);
    });

    it('DELETE /cards/:id → 401 without token', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete('/cards/507f1f77bcf86cd799439011') as SupertestResponse;
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Cross-user ownership checks — Links
  // =========================================================================

  describe('2. Ownership — Links', () => {
    let userALinkId: string;

    beforeAll(async () => {
      const a = await createAccount();
      userAToken = a.accessToken;
      userAPublicId = a.publicId;
      const b = await createAccount();
      userBToken = b.accessToken;
      userBPublicId = b.publicId;

      // User A creates a link
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/links')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ title: 'My Link', url: 'https://example.com', mode: 'work', category: 'custom' })
        .expect(201) as SupertestResponse;
      userALinkId = res.body._id;
    });

    it('user B cannot GET user A\'s link', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get(`/links/${userALinkId}`)
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(404);
    });

    it('user B cannot PATCH user A\'s link', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch(`/links/${userALinkId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ title: 'Hacked' }) as SupertestResponse;
      expect(res.status).toBe(404);
    });

    it('user B cannot DELETE user A\'s link', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete(`/links/${userALinkId}`)
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(404);

      // Verify the link still exists for user A
      const verify = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get(`/links/${userALinkId}`)
        .set('Authorization', `Bearer ${userAToken}`) as SupertestResponse;
      expect(verify.status).toBe(200);
    });

    it('user B cannot reorder user A\'s links', async () => {
      // User B tries to reorder with user A's link ID in a different mode
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .put('/links/reorder')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ mode: 'work', orderedIds: [userALinkId] }) as SupertestResponse;
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 3. Cross-user ownership checks — Network contacts
  // =========================================================================

  describe('3. Ownership — Network contacts', () => {
    let userAContactId: string;

    beforeAll(async () => {
      // User A saves user B's profile as a contact
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/network')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          publicId: userBPublicId,
          source: 'link',
          tappedAt: new Date().toISOString(),
        })
        .expect(201) as SupertestResponse;
      userAContactId = res.body._id;
    });

    it('user B cannot PATCH user A\'s network contact note', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch(`/network/${userAContactId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ note: 'Hacked note' }) as SupertestResponse;
      expect(res.status).toBe(404);
    });

    it('user B cannot DELETE user A\'s network contact', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete(`/network/${userAContactId}`)
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(404);

      // Verify the contact still exists for user A
      const list = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/network')
        .set('Authorization', `Bearer ${userAToken}`) as SupertestResponse;
      expect(list.status).toBe(200);
      const ids = list.body.contacts.map((c: { _id: string }) => c._id);
      expect(ids).toContain(userAContactId);
    });

    it('user A\'s network list does not leak to user B', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/network')
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(200);
      const ids = res.body.contacts.map((c: { _id: string }) => c._id);
      expect(ids).not.toContain(userAContactId);
    });
  });

  // =========================================================================
  // 4. Cross-user ownership checks — Cards
  // =========================================================================

  describe('4. Ownership — Cards', () => {
    let userACardId: string;

    beforeAll(async () => {
      // User A binds a card
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .post('/cards/bind')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ uid: '04AAAABBBBCC01', label: 'Main' })
        .expect(201) as SupertestResponse;
      userACardId = res.body._id;
    });

    it('user B cannot DELETE user A\'s card', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .delete(`/cards/${userACardId}`)
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(403);
    });

    it('user B cannot PATCH user A\'s card', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch(`/cards/${userACardId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ label: 'Hacked' }) as SupertestResponse;
      expect(res.status).toBe(403);
    });

    it('user B\'s card list does not include user A\'s card', async () => {
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/cards')
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(200);
      const ids = res.body.map((c: { _id: string }) => c._id);
      expect(ids).not.toContain(userACardId);
    });
  });

  // =========================================================================
  // 5. Profile is self-scoped (no cross-user profile mutation possible)
  // =========================================================================

  describe('5. Profile self-scoping', () => {
    it('PATCH /user/me only updates the authenticated user', async () => {
      // User A sets their name
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch('/user/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fullName: 'User A Name' })
        .expect(200);

      // User B fetches their own profile — should NOT see User A's name
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/user/me')
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(200);
      expect(res.body.fullName).not.toBe('User A Name');
    });

    it('PATCH /user/mode only affects the authenticated user', async () => {
      // User A switches to casual
      await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .patch('/user/mode')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ mode: 'casual' })
        .expect(200);

      // User B should still be on work (default)
      const res = await (request(app.getHttpServer()) as ReturnType<typeof request>)
        .get('/user/me')
        .set('Authorization', `Bearer ${userBToken}`) as SupertestResponse;
      expect(res.status).toBe(200);
      expect(res.body.activeMode).toBe('work');
    });
  });
});
