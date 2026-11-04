import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CustomNameClaim } from '../../custom-names/schemas/custom-name-claim.schema.js';
import { ProfileLink } from '../../links/schemas/profile-link.schema.js';
import { User } from '../../users/schemas/user.schema.js';
import { PublicService } from './public.service.js';

// ---------------------------------------------------------------------------
// Public Service Unit Tests
//
// Tests profile retrieval logic with mocked models, covering filtering,
// redirects, and 404 cases.
//
// Requirements: 5.1–5.3, 6.1–6.5
// ---------------------------------------------------------------------------

describe('PublicService', () => {
  let service: PublicService;
  let userModel: Model<User>;
  let linkModel: Model<ProfileLink>;
  let customNameClaimModel: Model<CustomNameClaim>;

  const mockUser = {
    _id: new Types.ObjectId(),
    publicId: 'test123456',
    customName: 'testuser',
    fullName: 'Test User',
    designation: 'Software Engineer',
    company: 'Acme Corp',
    bio: 'Test bio',
    avatarUrl: 'https://example.com/avatar.jpg',
    phone: '+1234567890',
    publicEmail: 'test@example.com',
    hiddenFields: [],
    activeMode: 'work' as const,
    status: 'active' as const,
  };

  const mockLinks = [
    {
      _id: new Types.ObjectId(),
      userId: mockUser._id,
      mode: 'work',
      title: 'LinkedIn',
      url: 'https://linkedin.com/in/testuser',
      icon: 'linkedin',
      category: 'linkedin',
      isEnabled: true,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(ProfileLink.name),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getModelToken(CustomNameClaim.name),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
    userModel = module.get<Model<User>>(getModelToken(User.name));
    linkModel = module.get<Model<ProfileLink>>(getModelToken(ProfileLink.name));
    customNameClaimModel = module.get<Model<CustomNameClaim>>(
      getModelToken(CustomNameClaim.name),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfileByPublicId', () => {
    it('should return public profile with enabled links (Requirement 5.1, 5.2)', async () => {
      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
      });

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: selectMock,
      } as any);

      const sortMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockLinks),
          }),
        }),
      });

      jest.spyOn(linkModel, 'find').mockReturnValue({
        sort: sortMock,
      } as any);

      const result = await service.getProfileByPublicId('test123456');

      expect(result).toMatchObject({
        publicId: 'test123456',
        customName: 'testuser',
        fullName: 'Test User',
        mode: 'work',
        contact: {
          phone: '+1234567890',
          email: 'test@example.com',
        },
      });

      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.title).toBe('LinkedIn');
    });

    it('should filter hidden fields (Requirement 5.1)', async () => {
      const userWithHidden = {
        ...mockUser,
        hiddenFields: ['phone', 'publicEmail'],
      };

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(userWithHidden),
        }),
      });

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: selectMock,
      } as any);

      const sortMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      jest.spyOn(linkModel, 'find').mockReturnValue({
        sort: sortMock,
      } as any);

      const result = await service.getProfileByPublicId('test123456');

      expect(result.contact.phone).toBeUndefined();
      expect(result.contact.email).toBeUndefined();
    });

    it('should throw 404 for non-existent user (Requirement 5.3)', async () => {
      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: selectMock,
      } as any);

      await expect(service.getProfileByPublicId('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw 404 for suspended users (Requirement 5.3)', async () => {
      const suspendedUser = { ...mockUser, status: 'suspended' as const };

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(suspendedUser),
        }),
      });

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: selectMock,
      } as any);

      await expect(service.getProfileByPublicId('test123456')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw 404 for deleted users (Requirement 5.3)', async () => {
      const deletedUser = { ...mockUser, status: 'deleted' as const };

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(deletedUser),
        }),
      });

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        select: selectMock,
      } as any);

      await expect(service.getProfileByPublicId('test123456')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProfileByCustomName', () => {
    it('should return profile for current custom name (Requirement 6.1)', async () => {
      const mockClaim = {
        name: 'testuser',
        userId: mockUser._id,
        status: 'current' as const,
      };

      jest.spyOn(customNameClaimModel, 'findOne').mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockClaim),
        }),
      } as any);

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
      });

      jest.spyOn(userModel, 'findById').mockReturnValue({
        select: selectMock,
      } as any);

      const sortMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      jest.spyOn(linkModel, 'find').mockReturnValue({
        sort: sortMock,
      } as any);

      const result = await service.getProfileByCustomName('testuser');

      expect(result.profile).toBeDefined();
      expect(result.profile?.customName).toBe('testuser');
      expect(result.redirectTo).toBeUndefined();
    });

    it('should return redirectTo for retired name (Requirement 6.3)', async () => {
      const mockClaim = {
        name: 'oldname',
        userId: mockUser._id,
        status: 'retired' as const,
      };

      jest.spyOn(customNameClaimModel, 'findOne').mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockClaim),
        }),
      } as any);

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
      });

      jest.spyOn(userModel, 'findById').mockReturnValue({
        select: selectMock,
      } as any);

      const result = await service.getProfileByCustomName('oldname');

      expect(result.profile).toBeUndefined();
      expect(result.redirectTo).toBe('/c/test123456');
    });

    it('should throw 404 for non-existent custom name', async () => {
      jest.spyOn(customNameClaimModel, 'findOne').mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      } as any);

      await expect(service.getProfileByCustomName('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw 404 for deleted user with custom name (Requirement 5.3)', async () => {
      const mockClaim = {
        name: 'testuser',
        userId: mockUser._id,
        status: 'current' as const,
      };

      const deletedUser = { ...mockUser, status: 'deleted' as const };

      jest.spyOn(customNameClaimModel, 'findOne').mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockClaim),
        }),
      } as any);

      const selectMock = jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(deletedUser),
        }),
      });

      jest.spyOn(userModel, 'findById').mockReturnValue({
        select: selectMock,
      } as any);

      await expect(service.getProfileByCustomName('testuser')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
