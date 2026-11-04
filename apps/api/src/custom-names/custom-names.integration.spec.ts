// ---------------------------------------------------------------------------
// Set required environment variables BEFORE any module is imported.
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

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');

import { CustomNamesModule } from './custom-names.module';
import { CustomNameClaim } from './schemas/custom-name-claim.schema';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/index.js';
import { UsersModule } from '../users/users.module';

describe('CustomNamesController (Integration)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let customNameClaimModel: Model<CustomNameClaim>;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        AppConfigModule,
        AuthModule,
        UsersModule,
        CustomNamesModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    customNameClaimModel = moduleFixture.get<Model<CustomNameClaim>>(
      getModelToken(CustomNameClaim.name),
    );

    // Create an anonymous user and get an access token
    const signupResponse = await request(app.getHttpServer())
      .post('/auth/anonymous')
      .expect(201);

    accessToken = signupResponse.body.accessToken;
    userId = signupResponse.body.userId;
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  afterEach(async () => {
    await customNameClaimModel.deleteMany({});
  });

  describe('GET /user/custom-name/available', () => {
    it('should return available for a valid unclaimed name', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=validname123')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({ available: true });
    });

    it('should return unavailable for a name that is too short', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=ab')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'Name must be at least 3 characters long',
      });
    });

    it('should return unavailable for a name that is too long', async () => {
      const longName = 'a'.repeat(31);
      const response = await request(app.getHttpServer())
        .get(`/user/custom-name/available?name=${longName}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'Name must be no more than 30 characters long',
      });
    });

    it('should return unavailable for a name with invalid characters', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=invalid@name')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason:
          'Name can only contain lowercase letters, numbers, underscores, and hyphens',
      });
    });

    it('should return unavailable for a reserved name', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=admin')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'This name is reserved and cannot be used',
      });
    });

    it('should return unavailable for a name that is already taken', async () => {
      // Create a custom name claim
      await customNameClaimModel.create({
        name: 'takenname',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=takenname')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'This name is already taken',
      });
    });

    it('should return unavailable for a retired name', async () => {
      // Create a retired custom name claim
      await customNameClaimModel.create({
        name: 'retiredname',
        userId: new Types.ObjectId(userId),
        status: 'retired',
        claimedAt: new Date(),
        retiredAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=retiredname')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'This name is already taken',
      });
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .get('/user/custom-name/available?name=validname')
        .expect(401);
    });

    it('should require the name query parameter', async () => {
      await request(app.getHttpServer())
        .get('/user/custom-name/available')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should handle names with underscores and hyphens', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=valid_name-123')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({ available: true });
    });

    it('should normalize uppercase names to lowercase', async () => {
      // Create a lowercase claim
      await customNameClaimModel.create({
        name: 'mixedcase',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      });

      // Check with uppercase - should detect as taken
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=MixedCase')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'This name is already taken',
      });
    });

    it('should reject names starting with underscore', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=_invalid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'Name must start with a letter or number',
      });
    });

    it('should reject names starting with hyphen', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=-invalid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        available: false,
        reason: 'Name must start with a letter or number',
      });
    });

    it('should accept names starting with a number', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=123valid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({ available: true });
    });

    it('should handle boundary length names', async () => {
      // Exactly 3 characters
      const response3 = await request(app.getHttpServer())
        .get('/user/custom-name/available?name=abc')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response3.body).toEqual({ available: true });

      // Exactly 30 characters
      const name30 = 'a'.repeat(30);
      const response30 = await request(app.getHttpServer())
        .get(`/user/custom-name/available?name=${name30}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response30.body).toEqual({ available: true });
    });
  });

  describe('PUT /user/custom-name', () => {
    it('should claim a new custom name successfully (first claim)', async () => {
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'mynewname' })
        .expect(200);

      expect(response.body).toEqual({
        name: 'mynewname',
        status: 'claimed',
      });

      // Verify claim was created in database
      const claim = await customNameClaimModel
        .findOne({ userId: new Types.ObjectId(userId), status: 'current' })
        .lean()
        .exec();

      expect(claim).toMatchObject({
        name: 'mynewname',
        status: 'current',
      });
      expect(claim?.claimedAt).toBeInstanceOf(Date);
    });

    it('should change custom name (retire old, claim new)', async () => {
      // First, claim a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'oldname' })
        .expect(200);

      // Change to a new name
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'newname' })
        .expect(200);

      expect(response.body).toEqual({
        name: 'newname',
        status: 'claimed',
      });

      // Verify old claim was retired
      const oldClaim = await customNameClaimModel
        .findOne({ name: 'oldname' })
        .lean()
        .exec();

      expect(oldClaim).toMatchObject({
        name: 'oldname',
        status: 'retired',
      });
      expect(oldClaim?.retiredAt).toBeInstanceOf(Date);

      // Verify new claim is current
      const newClaim = await customNameClaimModel
        .findOne({ name: 'newname' })
        .lean()
        .exec();

      expect(newClaim).toMatchObject({
        name: 'newname',
        status: 'current',
      });
    });

    it('should normalize name to lowercase', async () => {
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'MixedCase' })
        .expect(200);

      expect(response.body).toEqual({
        name: 'mixedcase',
        status: 'claimed',
      });
    });

    it('should reject invalid name format', async () => {
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'ab' }) // Too short
        .expect(400);

      expect(response.body.message).toContain(
        'Name must be at least 3 characters',
      );
    });

    it('should reject reserved names', async () => {
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'admin' })
        .expect(400);

      expect(response.body.message).toContain('reserved');
    });

    it('should reject taken names', async () => {
      // Create a different user
      const user2Response = await request(app.getHttpServer())
        .post('/auth/anonymous')
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      // User 1 claims a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'takenname' })
        .expect(200);

      // User 2 tries to claim the same name
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'takenname' })
        .expect(400);

      expect(response.body.message).toContain('already taken');
    });

    it('should enforce rate limit (3 changes per 30 days)', async () => {
      // Claim first name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name1' })
        .expect(200);

      // Change to second name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name2' })
        .expect(200);

      // Change to third name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name3' })
        .expect(200);

      // Fourth change should fail
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name4' })
        .expect(409);

      expect(response.body.message).toContain('3 times per 30 days');
    });

    it('should allow re-claiming own retired name without counting against rate limit', async () => {
      // Claim and retire a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'originalname' })
        .expect(200);

      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name2' })
        .expect(200);

      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'name3' })
        .expect(200);

      // Re-claim the original retired name should succeed
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'originalname' })
        .expect(200);

      expect(response.body).toEqual({
        name: 'originalname',
        status: 'claimed',
      });
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .send({ name: 'validname' })
        .expect(401);
    });

    it('should require name in request body', async () => {
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should reject names with invalid characters in body validation', async () => {
      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'invalid@name' })
        .expect(400);

      expect(response.body.message).toContain('lowercase letters');
    });

    it('should update User.customName field', async () => {
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'mynewname' })
        .expect(200);

      // Check user profile
      const profileResponse = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileResponse.body.customName).toBe('mynewname');
    });

    it('should keep retired names reserved for original owner', async () => {
      // User 1 claims and retires a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'retiredname' })
        .expect(200);

      await request(app.getHttpServer())
        .delete('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // User 2 tries to claim the retired name
      const user2Response = await request(app.getHttpServer())
        .post('/auth/anonymous')
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'retiredname' })
        .expect(400);

      expect(response.body.message).toContain('already taken');
    });
  });

  describe('DELETE /user/custom-name', () => {
    it('should remove custom name successfully', async () => {
      // First claim a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'myname' })
        .expect(200);

      // Remove it
      await request(app.getHttpServer())
        .delete('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify claim was retired
      const claim = await customNameClaimModel
        .findOne({ name: 'myname' })
        .lean()
        .exec();

      expect(claim).toMatchObject({
        name: 'myname',
        status: 'retired',
      });
      expect(claim?.retiredAt).toBeInstanceOf(Date);

      // Verify User.customName was cleared
      const profileResponse = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileResponse.body.customName).toBeUndefined();
    });

    it('should return 204 even if no custom name exists', async () => {
      await request(app.getHttpServer())
        .delete('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .delete('/user/custom-name')
        .expect(401);
    });

    it('should keep retired name reserved', async () => {
      // Claim and remove a name
      await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'reservedname' })
        .expect(200);

      await request(app.getHttpServer())
        .delete('/user/custom-name')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Try to claim it with a different user
      const user2Response = await request(app.getHttpServer())
        .post('/auth/anonymous')
        .expect(201);

      const user2Token = user2Response.body.accessToken;

      const response = await request(app.getHttpServer())
        .put('/user/custom-name')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'reservedname' })
        .expect(400);

      expect(response.body.message).toContain('already taken');
    });
  });
});
