import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AnalyticsService } from './analytics.service.js';
import { AnalyticsEvent, AnalyticsEventDocument } from './schemas/analytics-event.schema.js';
import { ProfileLink, ProfileLinkDocument } from '../links/schemas/profile-link.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { CreateEventDto } from './dto/create-event.dto.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let analyticsEventModel: any;
  let profileLinkModel: Model<ProfileLinkDocument>;
  let userModel: Model<UserDocument>;

  const mockUserId = new Types.ObjectId();
  const mockLinkId = new Types.ObjectId();
  const mockPublicId = 'abc1234567';

  // Mock AnalyticsEvent model class
  class MockAnalyticsEventModel {
    data: any;
    constructor(data: any) {
      this.data = data;
      this.save = jest.fn().mockResolvedValue(data);
    }
    save: jest.Mock;
    static countDocuments = jest.fn();
    static aggregate = jest.fn();
    static find = jest.fn();
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getModelToken(AnalyticsEvent.name),
          useValue: MockAnalyticsEventModel,
        },
        {
          provide: getModelToken(ProfileLink.name),
          useValue: {
            updateOne: jest.fn(),
          },
        },
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    analyticsEventModel = MockAnalyticsEventModel;
    profileLinkModel = module.get<Model<ProfileLinkDocument>>(
      getModelToken(ProfileLink.name),
    );
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));

    // Reset static methods before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordEvent - Bot filtering (Requirement 8.6)', () => {
    it('should reject bot user-agents', async () => {
      const botUserAgents = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'facebookexternalhit/1.1',
        'curl/7.68.0',
        'python-requests/2.25.1',
        'HeadlessChrome/91.0.4472.77',
      ];

      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'view',
        mode: 'work',
      };

      for (const userAgent of botUserAgents) {
        const request = {
          headers: { 'user-agent': userAgent },
        };

        await service.recordEvent(dto, request);

        // Bot requests should be silently ignored (no save)
        expect(userModel.findOne).not.toHaveBeenCalled();
      }
    });

    it('should accept legitimate user-agents', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'view',
        mode: 'work',
      };

      const request = {
        headers: {
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      jest.spyOn(service as any, 'isDuplicateView').mockResolvedValue(false);

      // Track creation by monitoring the model usage
      let saveWasCalled = false;
      const originalConstructor = (service as any).analyticsEventModel;
      (service as any).analyticsEventModel = class extends MockAnalyticsEventModel {
        constructor(data: any) {
          super(data);
          this.save = jest.fn().mockImplementation(async () => {
            saveWasCalled = true;
            return data;
          });
        }
      };

      await service.recordEvent(dto, request);

      expect(userModel.findOne).toHaveBeenCalledWith({ publicId: mockPublicId });
      expect(saveWasCalled).toBe(true);

      // Restore
      (service as any).analyticsEventModel = originalConstructor;
    });
  });

  describe('recordEvent - Session de-duplication (Requirement 8.7)', () => {
    it('should ignore duplicate views within 30-minute window', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'view',
        mode: 'work',
      };

      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      // Mock isDuplicateView to return true (duplicate detected)
      jest.spyOn(service as any, 'isDuplicateView').mockResolvedValue(true);

      let saveWasCalled = false;
      const originalConstructor = (service as any).analyticsEventModel;
      (service as any).analyticsEventModel = class extends MockAnalyticsEventModel {
        constructor(data: any) {
          super(data);
          this.save = jest.fn().mockImplementation(async () => {
            saveWasCalled = true;
            return data;
          });
        }
      };

      await service.recordEvent(dto, request);

      // Duplicate views should not be saved
      expect(saveWasCalled).toBe(false);

      // Restore
      (service as any).analyticsEventModel = originalConstructor;
    });

    it('should allow link_click events without de-duplication', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'link_click',
        mode: 'work',
        linkId: mockLinkId.toString(),
      };

      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      let saveWasCalled = false;
      const originalConstructor = (service as any).analyticsEventModel;
      (service as any).analyticsEventModel = class extends MockAnalyticsEventModel {
        constructor(data: any) {
          super(data);
          this.save = jest.fn().mockImplementation(async () => {
            saveWasCalled = true;
            return data;
          });
        }
      };

      jest.spyOn(profileLinkModel, 'updateOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as any);

      // Link clicks should NOT trigger de-duplication check
      const isDuplicateSpy = jest.spyOn(service as any, 'isDuplicateView');

      await service.recordEvent(dto, request);

      expect(isDuplicateSpy).not.toHaveBeenCalled();
      expect(saveWasCalled).toBe(true);

      // Restore
      (service as any).analyticsEventModel = originalConstructor;
    });
  });

  describe('recordEvent - Click count increment (Requirement 11.2)', () => {
    it('should increment ProfileLink.clickCount on link_click events', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'link_click',
        mode: 'work',
        linkId: mockLinkId.toString(),
      };

      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      let saveWasCalled = false;
      const originalConstructor = (service as any).analyticsEventModel;
      (service as any).analyticsEventModel = class extends MockAnalyticsEventModel {
        constructor(data: any) {
          super(data);
          this.save = jest.fn().mockImplementation(async () => {
            saveWasCalled = true;
            return data;
          });
        }
      };

      const updateOneMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });
      jest.spyOn(profileLinkModel, 'updateOne').mockImplementation(updateOneMock);

      await service.recordEvent(dto, request);

      expect(updateOneMock).toHaveBeenCalledWith(
        { _id: new Types.ObjectId(mockLinkId.toString()) },
        { $inc: { clickCount: 1 } },
      );
      expect(saveWasCalled).toBe(true);

      // Restore
      (service as any).analyticsEventModel = originalConstructor;
    });

    it('should NOT increment clickCount for view events', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'view',
        mode: 'work',
      };

      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
        socket: { remoteAddress: '192.168.1.1' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      jest.spyOn(service as any, 'isDuplicateView').mockResolvedValue(false);

      let saveWasCalled = false;
      const originalConstructor = (service as any).analyticsEventModel;
      (service as any).analyticsEventModel = class extends MockAnalyticsEventModel {
        constructor(data: any) {
          super(data);
          this.save = jest.fn().mockImplementation(async () => {
            saveWasCalled = true;
            return data;
          });
        }
      };

      const updateOneMock = jest.fn();
      jest.spyOn(profileLinkModel, 'updateOne').mockImplementation(updateOneMock);

      await service.recordEvent(dto, request);

      expect(updateOneMock).not.toHaveBeenCalled();
      expect(saveWasCalled).toBe(true);

      // Restore
      (service as any).analyticsEventModel = originalConstructor;
    });
  });

  describe('recordEvent - No raw IP storage (Requirement 8.1, 8.9)', () => {
    it('should hash IP and user-agent instead of storing raw IP', async () => {
      const dto: CreateEventDto = {
        publicId: mockPublicId,
        type: 'view',
        mode: 'work',
      };

      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
        socket: { remoteAddress: '192.168.1.100' },
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: mockUserId }),
      } as any);

      jest.spyOn(service as any, 'isDuplicateView').mockResolvedValue(false);

      let capturedData: any;
      const originalConstructor = MockAnalyticsEventModel;
      const mockConstructor = jest.fn().mockImplementation((data) => {
        capturedData = data;
        return new originalConstructor(data);
      });

      // Temporarily replace the model
      (service as any).analyticsEventModel = mockConstructor;

      await service.recordEvent(dto, request);

      // Verify sessionHash is present and not the raw IP
      expect(capturedData).toBeDefined();
      expect(capturedData.sessionHash).toBeDefined();
      expect(capturedData.sessionHash).not.toContain('192.168.1.100');
      expect(typeof capturedData.sessionHash).toBe('string');
      expect(capturedData.sessionHash.length).toBeGreaterThan(0);
    });
  });

  describe('getSummary (Requirement 8.4)', () => {
    it('should return aggregate counts over date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      MockAnalyticsEventModel.countDocuments = jest.fn().mockImplementation((query: any) => {
        const result = {
          exec: jest.fn().mockResolvedValue(
            query.type === 'view' ? 100 : query.type === 'link_click' ? 50 : 10,
          ),
        };
        return result as any;
      });

      const summary = await service.getSummary(mockUserId.toString(), startDate, endDate);

      expect(summary).toEqual({
        totalViews: 100,
        totalLinkClicks: 50,
        totalContactSaves: 10,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      });
    });
  });

  describe('getLinkAnalytics (Requirement 8.5)', () => {
    it('should return per-link click breakdown', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const mockAggregateResult = [
        {
          linkId: mockLinkId.toString(),
          linkTitle: 'My LinkedIn',
          clickCount: 42,
          mode: 'work' as const,
        },
      ];

      MockAnalyticsEventModel.aggregate = jest.fn().mockResolvedValue(mockAggregateResult as any);

      const result = await service.getLinkAnalytics(mockUserId.toString(), startDate, endDate);

      expect(result).toEqual(mockAggregateResult);
      expect(MockAnalyticsEventModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getRecentEvents (Requirement 8.5)', () => {
    it('should return recent events with limit', async () => {
      const mockEvents = [
        {
          type: 'view' as const,
          mode: 'work' as const,
          occurredAt: new Date(),
          country: 'US',
          deviceType: 'ios' as const,
        },
        {
          type: 'link_click' as const,
          mode: 'casual' as const,
          occurredAt: new Date(),
          country: 'GB',
          deviceType: 'android' as const,
          linkId: { title: 'GitHub' },
        },
      ];

      MockAnalyticsEventModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockEvents),
      } as any);

      const result = await service.getRecentEvents(mockUserId.toString(), 50);

      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe('view');
      expect(result[1]?.type).toBe('link_click');
      expect(result[1]?.linkTitle).toBe('GitHub');
    });
  });

  describe('Device type extraction', () => {
    it('should correctly identify iOS devices', () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)';
      const deviceType = (service as any).extractDeviceType(userAgent);
      expect(deviceType).toBe('ios');
    });

    it('should correctly identify Android devices', () => {
      const userAgent = 'Mozilla/5.0 (Linux; Android 11; Pixel 5)';
      const deviceType = (service as any).extractDeviceType(userAgent);
      expect(deviceType).toBe('android');
    });

    it('should correctly identify desktop devices', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const deviceType = (service as any).extractDeviceType(userAgent);
      expect(deviceType).toBe('desktop');
    });

    it('should return "other" for unknown devices', () => {
      const userAgent = 'SomeUnknownDevice/1.0';
      const deviceType = (service as any).extractDeviceType(userAgent);
      expect(deviceType).toBe('other');
    });
  });

  describe('Referrer sanitization', () => {
    it('should extract origin only from referrer', () => {
      const referrer = 'https://example.com/path/to/page?query=param';
      const sanitized = (service as any).sanitizeReferrer(referrer);
      expect(sanitized).toBe('https://example.com');
    });

    it('should return undefined for invalid referrer', () => {
      const referrer = 'not-a-valid-url';
      const sanitized = (service as any).sanitizeReferrer(referrer);
      expect(sanitized).toBeUndefined();
    });

    it('should return undefined for missing referrer', () => {
      const sanitized = (service as any).sanitizeReferrer(undefined);
      expect(sanitized).toBeUndefined();
    });
  });
});
