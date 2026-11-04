import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { CardsService } from './cards.service.js';
import { NfcCard, NfcCardDocument } from './schemas/nfc-card.schema.js';
import { AppConfigService } from '../config/app-config.service.js';

describe('CardsService', () => {
  let service: CardsService;
  let cardModel: Model<NfcCardDocument>;
  let mockConfig: jest.Mocked<AppConfigService>;

  const userId = new Types.ObjectId().toString();
  const publicId = 'abc123xyz9';

  beforeEach(async () => {
    mockConfig = {
      nextPublicUrl: 'https://tapsync.app',
    } as jest.Mocked<AppConfigService>;

    // Create a mock constructor function
    const mockCardConstructor = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ ...dto }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CardsService,
        {
          provide: getModelToken(NfcCard.name),
          useValue: Object.assign(mockCardConstructor, {
            findOne: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
          }),
        },
        {
          provide: AppConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<CardsService>(CardsService);
    cardModel = module.get<Model<NfcCardDocument>>(getModelToken(NfcCard.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProgramPayload', () => {
    it('should return the canonical profile URL', async () => {
      const result = await service.getProgramPayload(publicId);

      expect(result).toEqual({
        url: 'https://tapsync.app/c/abc123xyz9',
      });
    });

    it('should never use custom name URL', async () => {
      const result = await service.getProgramPayload('different-id');

      expect(result.url).toContain('/c/different-id');
      expect(result.url).not.toContain('/p/');
    });
  });

  describe('bindCard', () => {
    it('should normalize UID to uppercase hex without separators', async () => {
      const uid = '04:ab:cd:ef:01:23:45';
      const expectedNormalized = '04ABCDEF012345';

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(cardModel, 'countDocuments').mockResolvedValue(0);

      await service.bindCard(userId, { uid });

      expect(cardModel.findOne).toHaveBeenCalledWith({ uid: expectedNormalized });
      expect(cardModel).toHaveBeenCalledWith(
        expect.objectContaining({ uid: expectedNormalized }),
      );
    });

    it('should create a new card binding when card does not exist', async () => {
      const uid = '04ABCDEF012345';

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(cardModel, 'countDocuments').mockResolvedValue(0);

      const result = await service.bindCard(userId, { uid });

      expect(cardModel.countDocuments).toHaveBeenCalledWith({
        mappedUserId: expect.any(Types.ObjectId),
        status: 'active',
      });
      expect(cardModel).toHaveBeenCalledWith(
        expect.objectContaining({
          uid,
          status: 'active',
        }),
      );
    });

    it('should reject if card is already bound to a different user', async () => {
      const uid = '04ABCDEF012345';
      const otherUserId = new Types.ObjectId();

      const existingCard = {
        uid,
        mappedUserId: otherUserId,
        status: 'active',
      };

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(existingCard as any);

      await expect(service.bindCard(userId, { uid })).rejects.toThrow(
        ConflictException,
      );
      await expect(service.bindCard(userId, { uid })).rejects.toThrow(
        'already bound to another account',
      );
    });

    it('should allow rebinding by the same user', async () => {
      const uid = '04ABCDEF012345';
      const now = new Date();

      const existingCard: any = {
        uid,
        mappedUserId: new Types.ObjectId(userId),
        status: 'active',
        lastProgrammedAt: new Date(now.getTime() - 86400000), // 1 day ago
        label: undefined,
        save: jest.fn().mockResolvedValue(this),
      };

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(existingCard as any);

      const result = await service.bindCard(userId, { uid, label: 'Backup' });

      expect(existingCard.save).toHaveBeenCalled();
      expect(existingCard.status).toBe('active');
      expect(existingCard.label).toBe('Backup');
      expect(existingCard.lastProgrammedAt).toBeInstanceOf(Date);
    });

    it('should reject if user has reached the card limit', async () => {
      const uid = '04ABCDEF012345';

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(cardModel, 'countDocuments').mockResolvedValue(10);

      await expect(service.bindCard(userId, { uid })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.bindCard(userId, { uid })).rejects.toThrow(
        'maximum limit of 10 cards',
      );
    });

    it('should allow binding unassigned card', async () => {
      const uid = '04ABCDEF012345';

      const existingCard: any = {
        uid,
        mappedUserId: null,
        status: 'unassigned',
        label: undefined,
        lastProgrammedAt: undefined,
        save: jest.fn().mockResolvedValue(this),
      };

      jest.spyOn(cardModel, 'findOne').mockResolvedValue(existingCard as any);
      jest.spyOn(cardModel, 'countDocuments').mockResolvedValue(0);

      const result = await service.bindCard(userId, { uid });

      expect(existingCard.save).toHaveBeenCalled();
      expect(existingCard.status).toBe('active');
      expect(existingCard.mappedUserId).toEqual(new Types.ObjectId(userId));
    });

    it('should normalize various UID formats', async () => {
      const testCases = [
        { input: '04:ab:cd:ef', expected: '04ABCDEF' },
        { input: '04 AB CD EF', expected: '04ABCDEF' },
        { input: '04-ab-cd-ef', expected: '04ABCDEF' },
        { input: '04abcdef', expected: '04ABCDEF' },
        { input: '04:AB:cd:EF', expected: '04ABCDEF' },
      ];

      for (const { input, expected } of testCases) {
        jest.spyOn(cardModel, 'findOne').mockResolvedValue(null);
        jest.spyOn(cardModel, 'countDocuments').mockResolvedValue(0);

        await service.bindCard(userId, { uid: input });

        expect(cardModel.findOne).toHaveBeenCalledWith({ uid: expected });
      }
    });
  });

  describe('listCards', () => {
    it('should return all active cards for the user', async () => {
      const cards = [
        {
          _id: new Types.ObjectId(),
          uid: '04ABCDEF012345',
          mappedUserId: new Types.ObjectId(userId),
          status: 'active',
          label: 'Main',
        },
        {
          _id: new Types.ObjectId(),
          uid: '04FEDCBA543210',
          mappedUserId: new Types.ObjectId(userId),
          status: 'active',
          label: 'Backup',
        },
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(cards),
      };

      jest.spyOn(cardModel, 'find').mockReturnValue(mockQuery as any);

      const result = await service.listCards(userId);

      expect(cardModel.find).toHaveBeenCalledWith({
        mappedUserId: expect.any(Types.ObjectId),
        status: 'active',
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ lastProgrammedAt: -1 });
      expect(result).toEqual(cards);
    });

    it('should return empty array when user has no cards', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(cardModel, 'find').mockReturnValue(mockQuery as any);

      const result = await service.listCards(userId);

      expect(result).toEqual([]);
    });
  });

  describe('unassignCard', () => {
    it('should unassign a card owned by the user', async () => {
      const cardId = new Types.ObjectId().toString();

      const card = {
        _id: new Types.ObjectId(cardId),
        uid: '04ABCDEF012345',
        mappedUserId: new Types.ObjectId(userId),
        status: 'active',
        save: jest.fn().mockResolvedValue(this),
      };

      jest.spyOn(cardModel, 'findById').mockResolvedValue(card as any);

      await service.unassignCard(userId, cardId);

      expect(card.status).toBe('unassigned');
      expect(card.mappedUserId).toBeNull();
      expect(card.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if card does not exist', async () => {
      const cardId = new Types.ObjectId().toString();

      jest.spyOn(cardModel, 'findById').mockResolvedValue(null);

      await expect(service.unassignCard(userId, cardId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own the card', async () => {
      const cardId = new Types.ObjectId().toString();
      const otherUserId = new Types.ObjectId();

      const card = {
        _id: new Types.ObjectId(cardId),
        uid: '04ABCDEF012345',
        mappedUserId: otherUserId,
        status: 'active',
      };

      jest.spyOn(cardModel, 'findById').mockResolvedValue(card as any);

      await expect(service.unassignCard(userId, cardId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateCard', () => {
    it('should update card label', async () => {
      const cardId = new Types.ObjectId().toString();

      const card = {
        _id: new Types.ObjectId(cardId),
        uid: '04ABCDEF012345',
        mappedUserId: new Types.ObjectId(userId),
        status: 'active',
        label: 'Old Label',
        save: jest.fn().mockResolvedValue(this),
      };

      jest.spyOn(cardModel, 'findById').mockResolvedValue(card as any);

      await service.updateCard(userId, cardId, { label: 'New Label' });

      expect(card.label).toBe('New Label');
      expect(card.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if card does not exist', async () => {
      const cardId = new Types.ObjectId().toString();

      jest.spyOn(cardModel, 'findById').mockResolvedValue(null);

      await expect(
        service.updateCard(userId, cardId, { label: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own the card', async () => {
      const cardId = new Types.ObjectId().toString();
      const otherUserId = new Types.ObjectId();

      const card = {
        _id: new Types.ObjectId(cardId),
        uid: '04ABCDEF012345',
        mappedUserId: otherUserId,
        status: 'active',
      };

      jest.spyOn(cardModel, 'findById').mockResolvedValue(card as any);

      await expect(
        service.updateCard(userId, cardId, { label: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
