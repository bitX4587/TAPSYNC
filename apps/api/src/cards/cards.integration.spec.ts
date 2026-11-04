/**
 * Integration tests for card management endpoints.
 * Requirements 7.5, 7.8–7.11.
 *
 * Tests cover:
 * - Program payload endpoint
 * - Card binding with normalization
 * - Conflict detection (already bound to another user)
 * - Rebinding by same user
 * - Per-user card limit
 * - List cards
 * - Unassign card
 * - Ownership checks
 */

// Set environment variables BEFORE imports
process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/placeholder';
process.env['JWT_ACCESS_SECRET'] = 'test-secret-key-32-chars-min!!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-min';
process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
process.env['REVALIDATION_SECRET'] = 'test-revalidation-secret';
process.env['NEXT_PUBLIC_URL'] = 'https://tapsync.app';
process.env['CORS_ORIGIN'] = 'http://localhost:3000';
process.env['STORAGE_BUCKET'] = 'test-bucket';
process.env['STORAGE_KEY_ID'] = 'test-key-id';
process.env['STORAGE_SECRET'] = 'test-secret';
process.env['STORAGE_REGION'] = 'us-east-1';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

import { CardsModule } from './cards.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { AppConfigService } from '../config/app-config.service.js';
import { NfcCard } from './schemas/nfc-card.schema.js';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

describe('CardsController (integration)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let cardModel: Model<NfcCard>;

  const mockUser1 = { userId: 'user1-id', publicId: 'abc123xyz9' };
  const mockUser2 = { userId: 'user2-id', publicId: 'def456uvw8' };

  // Mock JWT guard to inject user
  const mockJwtGuard = (user: typeof mockUser1) => ({
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      req.user = user;
      return true;
    },
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Update the env var so AppConfigService returns the real URI too
    process.env['MONGODB_URI'] = mongoUri;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        AppConfigModule,
        CardsModule,
      ],
    })
      .overrideProvider(AppConfigService)
      .useValue({
        nextPublicUrl: 'https://tapsync.app',
      } as AppConfigService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    cardModel = moduleFixture.get<Model<NfcCard>>(getModelToken(NfcCard.name));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await cardModel.deleteMany({});
  });

  describe('GET /cards/program-payload', () => {
    it('should return the canonical profile URL', async () => {
      // Override guard for this test
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const response = await request(app.getHttpServer())
        .get('/cards/program-payload')
        .expect(200);

      expect(response.body).toEqual({
        url: 'https://tapsync.app/c/abc123xyz9',
      });
    });

    it('should use publicId from authenticated user', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const response = await request(app.getHttpServer())
        .get('/cards/program-payload')
        .expect(200);

      expect(response.body.url).toContain('/c/def456uvw8');
      expect(response.body.url).not.toContain('/p/');
    });
  });

  describe('POST /cards/bind', () => {
    it('should bind a new card with normalized UID', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const response = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04:ab:cd:ef:01:23:45', label: 'Main Card' })
        .expect(201);

      expect(response.body).toMatchObject({
        uid: '04ABCDEF012345',
        status: 'active',
        label: 'Main Card',
      });

      // Verify in DB
      const card = await cardModel.findOne({ uid: '04ABCDEF012345' });
      expect(card).toBeDefined();
      expect(card?.mappedUserId?.toString()).toBe(mockUser1.userId);
    });

    it('should reject if UID is already bound to another user', async () => {
      // User1 binds the card first
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      // User2 tries to bind the same card
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const response = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(409);

      expect(response.body.message).toContain('already bound to another account');
    });

    it('should allow rebinding by the same user', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // First bind
      await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345', label: 'Old Label' })
        .expect(201);

      // Wait a moment to ensure lastProgrammedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Rebind with new label
      const response = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345', label: 'New Label' })
        .expect(201);

      expect(response.body.label).toBe('New Label');
      expect(response.body.uid).toBe('04ABCDEF012345');

      // Verify only one card exists
      const count = await cardModel.countDocuments({ uid: '04ABCDEF012345' });
      expect(count).toBe(1);
    });

    it('should reject if user has reached the card limit', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // Bind 10 cards (the limit)
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/cards/bind')
          .send({ uid: `04ABCDEF01234${i}` })
          .expect(201);
      }

      // 11th card should be rejected
      const response = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04FEDCBA543210' })
        .expect(403);

      expect(response.body.message).toContain('maximum limit of 10 cards');
    });

    it('should allow binding unassigned card', async () => {
      // Create an unassigned card
      await cardModel.create({
        uid: '04ABCDEF012345',
        mappedUserId: null,
        status: 'unassigned',
      });

      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const response = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      expect(response.body.status).toBe('active');
      expect(response.body.uid).toBe('04ABCDEF012345');
    });

    it('should normalize various UID formats', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const formats = [
        '04:ab:cd:ef',
        '04 AB CD EF',
        '04-ab-cd-ef',
        '04abcdef',
      ];

      for (const [index, format] of formats.entries()) {
        const response = await request(app.getHttpServer())
          .post('/cards/bind')
          .send({ uid: `${format}${index}` })
          .expect(201);

        expect(response.body.uid).toMatch(/^[0-9A-F]+$/);
      }
    });
  });

  describe('GET /cards', () => {
    it('should list all active cards for the user', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // Bind two cards
      await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345', label: 'Main' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04FEDCBA543210', label: 'Backup' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/cards')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({ label: 'Backup' }); // Most recent first
      expect(response.body[1]).toMatchObject({ label: 'Main' });
    });

    it('should return empty array when user has no cards', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const response = await request(app.getHttpServer())
        .get('/cards')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should not show cards from other users', async () => {
      // User1 binds a card
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      // User2 should see no cards
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const response = await request(app.getHttpServer())
        .get('/cards')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('DELETE /cards/:id', () => {
    it('should unassign a card owned by the user', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // Bind a card
      const bindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      const cardId = bindResponse.body._id;

      // Unassign it
      await request(app.getHttpServer())
        .delete(`/cards/${cardId}`)
        .expect(204);

      // Verify it's unassigned in DB
      const card = await cardModel.findById(cardId);
      expect(card?.status).toBe('unassigned');
      expect(card?.mappedUserId).toBeNull();

      // Should not appear in list
      const listResponse = await request(app.getHttpServer())
        .get('/cards')
        .expect(200);

      expect(listResponse.body).toEqual([]);
    });

    it('should allow rebinding after unassign', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // Bind, unassign
      const bindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/cards/${bindResponse.body._id}`)
        .expect(204);

      // User2 can now bind it
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const rebindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      expect(rebindResponse.body.uid).toBe('04ABCDEF012345');
    });

    it('should return 404 if card does not exist', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app.getHttpServer())
        .delete(`/cards/${fakeId}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should return 403 if user does not own the card', async () => {
      // User1 binds a card
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const bindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      const cardId = bindResponse.body._id;

      // User2 tries to unassign it
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const response = await request(app.getHttpServer())
        .delete(`/cards/${cardId}`)
        .expect(403);

      expect(response.body.message).toContain('do not own');
    });
  });

  describe('PATCH /cards/:id', () => {
    it('should update card label', async () => {
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      // Bind a card
      const bindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345', label: 'Old Label' })
        .expect(201);

      const cardId = bindResponse.body._id;

      // Update label
      const response = await request(app.getHttpServer())
        .patch(`/cards/${cardId}`)
        .send({ label: 'New Label' })
        .expect(200);

      expect(response.body.label).toBe('New Label');
    });

    it('should return 403 if user does not own the card', async () => {
      // User1 binds a card
      const JwtAuthGuard = (await import('../auth/guards/jwt-auth.guard.js'))
        .JwtAuthGuard;
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser1).canActivate);

      const bindResponse = await request(app.getHttpServer())
        .post('/cards/bind')
        .send({ uid: '04ABCDEF012345' })
        .expect(201);

      const cardId = bindResponse.body._id;

      // User2 tries to update it
      jest
        .spyOn(JwtAuthGuard.prototype, 'canActivate')
        .mockImplementation(mockJwtGuard(mockUser2).canActivate);

      const response = await request(app.getHttpServer())
        .patch(`/cards/${cardId}`)
        .send({ label: 'Hacked Label' })
        .expect(403);

      expect(response.body.message).toContain('do not own');
    });
  });
});
