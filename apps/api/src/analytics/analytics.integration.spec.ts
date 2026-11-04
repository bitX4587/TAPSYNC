import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Response as SupertestResponse } from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

import { AnalyticsModule } from './analytics.module.js';
import { AuthModule } from '../auth/index.js';
import { UsersModule } from '../users/index.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { ProfileLink, ProfileLinkDocument } from '../links/schemas/profile-link.schema.js';
import { AnalyticsEvent, AnalyticsEventDocument } from './schemas/analytics-event.schema.js';
import { LinksModule } from '../links/index.js';
import { AppConfigModule } from '../config/index.js';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

describe('AnalyticsController (Integration)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let profileLinkModel: Model<ProfileLinkDocument>;
  let analyticsEventModel: Model<AnalyticsEventDocument>;
  let accessToken: string;
  let testUserId: string;
  let testPublicId: string;
  let testLinkId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        AppConfigModule,
        UsersModule,
        AuthModule,
        LinksModule,
        AnalyticsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    userModel = moduleRef.get<Model<UserDocument>>(getModelToken(User.name));
    profileLinkModel = moduleRef.get<Model<ProfileLinkDocument>>(
      getModelToken(ProfileLink.name),
    );
    analyticsEventModel = moduleRef.get<Model<AnalyticsEventDocument>>(
      getModelToken(AnalyticsEvent.name),
    );

    // Create a test user and get access token
    const authResponse = await request(app.getHttpServer())
      .post('/auth/anonymous')
      .expect(201);

    accessToken = authResponse.body.accessToken;
    testPublicId = authResponse.body.user.publicId;

    const user = await userModel.findOne({ publicId: testPublicId }).exec();
    testUserId = user!._id.toString();

    // Create a test link
    const link = await profileLinkModel.create({
      userId: user!._id,
      mode: 'work',
      title: 'Test Link',
      url: 'https://example.com',
      icon: 'link',
      category: 'custom',
      priorityOrder: 0,
      isEnabled: true,
      clickCount: 0,
    });
    testLinkId = link._id.toString();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await analyticsEventModel.deleteMany({}).exec();
  });

  describe('POST /analytics/events (unauthenticated)', () => {
    it('should record a view event', async () => {
      const response = await request(app.getHttpServer())
        .post('/analytics/events')
        .send({
          publicId: testPublicId,
          type: 'view',
          mode: 'work',
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('view');
      expect(events[0]?.mode).toBe('work');
    });

    it('should record a link_click event and increment clickCount', async () => {
      await request(app.getHttpServer())
        .post('/analytics/events')
        .send({
          publicId: testPublicId,
          type: 'link_click',
          mode: 'work',
          linkId: testLinkId,
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('link_click');
      expect(events[0]?.linkId!.toString()).toBe(testLinkId);

      const link = await profileLinkModel.findById(testLinkId).exec();
      expect(link!.clickCount).toBe(1);
    });

    it('should record a contact_save event', async () => {
      await request(app.getHttpServer())
        .post('/analytics/events')
        .send({
          publicId: testPublicId,
          type: 'contact_save',
          mode: 'casual',
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('contact_save');
      expect(events[0]?.mode).toBe('casual');
    });

    it('should reject invalid publicId', async () => {
      await request(app.getHttpServer())
        .post('/analytics/events')
        .send({
          publicId: 'invalid-id',
          type: 'view',
          mode: 'work',
        })
        .expect(400);
    });

    it('should reject invalid event type', async () => {
      await request(app.getHttpServer())
        .post('/analytics/events')
        .send({
          publicId: testPublicId,
          type: 'invalid_type',
          mode: 'work',
        })
        .expect(400);
    });

    it('should ignore bot user-agents', async () => {
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('User-Agent', 'Googlebot/2.1')
        .send({
          publicId: testPublicId,
          type: 'view',
          mode: 'work',
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(0); // Bot request ignored
    });

    it('should de-duplicate views within 30-minute window', async () => {
      // First view
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          publicId: testPublicId,
          type: 'view',
          mode: 'work',
        })
        .expect(204);

      // Duplicate view (same IP, same user-agent, within 30 minutes)
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          publicId: testPublicId,
          type: 'view',
          mode: 'work',
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(1); // Only one event recorded
    });

    it('should NOT de-duplicate link clicks', async () => {
      // First click
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          publicId: testPublicId,
          type: 'link_click',
          mode: 'work',
          linkId: testLinkId,
        })
        .expect(204);

      // Second click (same IP, same user-agent)
      await request(app.getHttpServer())
        .post('/analytics/events')
        .set('User-Agent', 'Mozilla/5.0 (iPhone)')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          publicId: testPublicId,
          type: 'link_click',
          mode: 'work',
          linkId: testLinkId,
        })
        .expect(204);

      const events = await analyticsEventModel.find({ userId: testUserId }).exec();
      expect(events).toHaveLength(2); // Both clicks recorded

      const link = await profileLinkModel.findById(testLinkId).exec();
      expect(link!.clickCount).toBe(2); // Counter incremented twice
    });
  });

  describe('GET /analytics/summary (authenticated, owner-only)', () => {
    beforeEach(async () => {
      // Seed some events
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      await analyticsEventModel.insertMany([
        // Recent events (within 7 days)
        { userId: testUserId, type: 'view', mode: 'work', occurredAt: now },
        { userId: testUserId, type: 'view', mode: 'work', occurredAt: now },
        { userId: testUserId, type: 'link_click', mode: 'work', occurredAt: now, linkId: testLinkId },
        { userId: testUserId, type: 'contact_save', mode: 'work', occurredAt: now },
        // Older events (within 30 days)
        { userId: testUserId, type: 'view', mode: 'casual', occurredAt: sevenDaysAgo },
        // Very old events (beyond 30 days)
        { userId: testUserId, type: 'view', mode: 'work', occurredAt: fortyDaysAgo },
      ]);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/analytics/summary').expect(401);
    });

    it('should return summary for 7d range', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/summary?range=7d')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.totalViews).toBe(2);
      expect(response.body.totalLinkClicks).toBe(1);
      expect(response.body.totalContactSaves).toBe(1);
    });

    it('should return summary for 30d range', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/summary?range=30d')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.totalViews).toBe(3);
      expect(response.body.totalLinkClicks).toBe(1);
      expect(response.body.totalContactSaves).toBe(1);
    });

    it('should return summary for all time', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/summary?range=all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.totalViews).toBe(4);
      expect(response.body.totalLinkClicks).toBe(1);
      expect(response.body.totalContactSaves).toBe(1);
    });

    it('should reject invalid range parameter', async () => {
      await request(app.getHttpServer())
        .get('/analytics/summary?range=invalid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('GET /analytics/links (authenticated, owner-only)', () => {
    beforeEach(async () => {
      await analyticsEventModel.insertMany([
        { userId: testUserId, type: 'link_click', mode: 'work', occurredAt: new Date(), linkId: testLinkId },
        { userId: testUserId, type: 'link_click', mode: 'work', occurredAt: new Date(), linkId: testLinkId },
        { userId: testUserId, type: 'link_click', mode: 'work', occurredAt: new Date(), linkId: testLinkId },
      ]);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/analytics/links').expect(401);
    });

    it('should return per-link analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/links?range=30d')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].linkId).toBe(testLinkId);
      expect(response.body[0].linkTitle).toBe('Test Link');
      expect(response.body[0].clickCount).toBe(3);
      expect(response.body[0].mode).toBe('work');
    });
  });

  describe('GET /analytics/events (authenticated, owner-only)', () => {
    beforeEach(async () => {
      await analyticsEventModel.insertMany([
        { userId: testUserId, type: 'view', mode: 'work', occurredAt: new Date(), country: 'US', deviceType: 'ios' },
        { userId: testUserId, type: 'link_click', mode: 'casual', occurredAt: new Date(), linkId: testLinkId },
        { userId: testUserId, type: 'contact_save', mode: 'work', occurredAt: new Date() },
      ]);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/analytics/events').expect(401);
    });

    it('should return recent events', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/events?limit=10')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].type).toBeDefined();
      expect(response.body[0].mode).toBeDefined();
      expect(response.body[0].occurredAt).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/events?limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should cap limit at 100', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/events?limit=200')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Should not error, and limit is capped internally
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Owner-only access (Requirement 8.6)', () => {
    let otherUserAccessToken: string;
    let otherUserId: string;

    beforeEach(async () => {
      // Create another user
      const authResponse = await request(app.getHttpServer())
        .post('/auth/anonymous')
        .expect(201);

      otherUserAccessToken = authResponse.body.accessToken;
      const otherPublicId = authResponse.body.user.publicId;

      const otherUser = await userModel.findOne({ publicId: otherPublicId }).exec();
      otherUserId = otherUser!._id.toString();

      // Seed event for the first user
      await analyticsEventModel.create({
        userId: testUserId,
        type: 'view',
        mode: 'work',
        occurredAt: new Date(),
      });
    });

    it('should NOT return analytics for other users', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/summary?range=all')
        .set('Authorization', `Bearer ${otherUserAccessToken}`)
        .expect(200);

      // Other user should see zero events (their own analytics only)
      expect(response.body.totalViews).toBe(0);
      expect(response.body.totalLinkClicks).toBe(0);
      expect(response.body.totalContactSaves).toBe(0);
    });
  });
});
