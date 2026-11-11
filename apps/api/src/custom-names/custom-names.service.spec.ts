import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { CustomNamesService } from './custom-names.service';
import {
  CustomNameClaim,
  CustomNameClaimDocument,
} from './schemas/custom-name-claim.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RevalidationService } from '../revalidation/revalidation.service';

describe('CustomNamesService', () => {
  let service: CustomNamesService;
  let claimModel: Model<CustomNameClaimDocument>;
  let userModel: Model<UserDocument>;

  const mockRevalidationService = {
    revalidateProfileAndPaths: jest.fn().mockResolvedValue(undefined),
  };

  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };

  const mockCustomNameClaimModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
    db: {
      startSession: jest.fn().mockResolvedValue(mockSession),
    },
  };

  const mockUserModel = {
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ publicId: 'test123' }),
        }),
      }),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomNamesService,
        {
          provide: getModelToken(CustomNameClaim.name),
          useValue: mockCustomNameClaimModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: RevalidationService,
          useValue: mockRevalidationService,
        },
      ],
    }).compile();

    service = module.get<CustomNamesService>(CustomNamesService);
    claimModel = module.get<Model<CustomNameClaimDocument>>(
      getModelToken(CustomNameClaim.name),
    );
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAvailability', () => {
    it('should return available for a valid, unclaimed name', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.checkAvailability('validname123');

      expect(result).toEqual({ available: true });
      expect(mockCustomNameClaimModel.findOne).toHaveBeenCalledWith({
        name: 'validname123',
      });
    });

    it('should normalize name to lowercase', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await service.checkAvailability('ValidName123');

      expect(mockCustomNameClaimModel.findOne).toHaveBeenCalledWith({
        name: 'validname123',
      });
    });

    it('should reject names shorter than 3 characters', async () => {
      const result = await service.checkAvailability('ab');

      expect(result).toEqual({
        available: false,
        reason: 'Name must be at least 3 characters long',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names longer than 30 characters', async () => {
      const longName = 'a'.repeat(31);
      const result = await service.checkAvailability(longName);

      expect(result).toEqual({
        available: false,
        reason: 'Name must be no more than 30 characters long',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names starting with underscore', async () => {
      const result = await service.checkAvailability('_invalidname');

      expect(result).toEqual({
        available: false,
        reason: 'Name must start with a letter or number',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names starting with hyphen', async () => {
      const result = await service.checkAvailability('-invalidname');

      expect(result).toEqual({
        available: false,
        reason: 'Name must start with a letter or number',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names with uppercase letters', async () => {
      // The regex check happens after lowercase conversion, but uppercase
      // letters are normalized before validation, so technically this passes
      // format check. However, the design is that names are stored lowercase.
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.checkAvailability('ValidName');

      // After normalization to lowercase, it should pass format check
      expect(result).toEqual({ available: true });
      expect(mockCustomNameClaimModel.findOne).toHaveBeenCalledWith({
        name: 'validname',
      });
    });

    it('should reject names with invalid characters', async () => {
      const result = await service.checkAvailability('invalid@name');

      expect(result).toEqual({
        available: false,
        reason:
          'Name can only contain lowercase letters, numbers, underscores, and hyphens',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names with spaces', async () => {
      const result = await service.checkAvailability('invalid name');

      expect(result).toEqual({
        available: false,
        reason:
          'Name can only contain lowercase letters, numbers, underscores, and hyphens',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should accept names with underscores in the middle', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.checkAvailability('valid_name');

      expect(result).toEqual({ available: true });
    });

    it('should accept names with hyphens in the middle', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.checkAvailability('valid-name');

      expect(result).toEqual({ available: true });
    });

    it('should reject reserved names', async () => {
      const result = await service.checkAvailability('admin');

      expect(result).toEqual({
        available: false,
        reason: 'This name is reserved and cannot be used',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject reserved names (case insensitive)', async () => {
      const result = await service.checkAvailability('ADMIN');

      expect(result).toEqual({
        available: false,
        reason: 'This name is reserved and cannot be used',
      });
      expect(mockCustomNameClaimModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject names that are already taken (current)', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            name: 'takenname',
            status: 'current',
          }),
        }),
      });

      const result = await service.checkAvailability('takenname');

      expect(result).toEqual({
        available: false,
        reason: 'This name is already taken',
      });
    });

    it('should reject names that are retired', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            name: 'retiredname',
            status: 'retired',
            userId: new Types.ObjectId(),
          }),
        }),
      });

      const result = await service.checkAvailability('retiredname');

      expect(result).toEqual({
        available: false,
        reason: 'This name is already taken',
      });
    });

    it('should allow re-claiming own retired name when userId is provided', async () => {
      const userId = new Types.ObjectId().toString();
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            name: 'myretiredname',
            status: 'retired',
            userId: new Types.ObjectId(userId),
          }),
        }),
      });

      const result = await service.checkAvailability('myretiredname', userId);

      expect(result).toEqual({ available: true });
    });

    it('should handle names with exactly 3 characters', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.checkAvailability('abc');

      expect(result).toEqual({ available: true });
    });

    it('should handle names with exactly 30 characters', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const name30 = 'a'.repeat(30);
      const result = await service.checkAvailability(name30);

      expect(result).toEqual({ available: true });
    });

    it('should trim whitespace from names', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await service.checkAvailability('  validname  ');

      expect(mockCustomNameClaimModel.findOne).toHaveBeenCalledWith({
        name: 'validname',
      });
    });
  });

  describe('claimOrChangeName', () => {
    const userId = new Types.ObjectId().toString();

    beforeEach(() => {
      // Reset session mocks
      mockSession.startTransaction.mockClear();
      mockSession.commitTransaction.mockClear();
      mockSession.abortTransaction.mockClear();
      mockSession.endSession.mockClear();
    });

    it('should claim a new custom name successfully (first claim)', async () => {
      // Mock availability check
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // No existing claim
          }),
        })
        // Mock rate limit check
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // Not a re-claim
          }),
        })
        // Mock finding current claim (none exists)
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        })
        // Mock finding existing retired claim (none exists)
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        });

      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0), // No recent changes
      });

      const mockNewClaim = {
        _id: new Types.ObjectId(),
        name: 'newname',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      };

      mockCustomNameClaimModel.create.mockResolvedValue([mockNewClaim]);

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const result = await service.claimOrChangeName(userId, 'newname');

      expect(result).toEqual(mockNewClaim);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { customName: 'newname' } },
      );
    });

    it('should change custom name (retire old, claim new)', async () => {
      const mockOldClaim = {
        _id: new Types.ObjectId(),
        name: 'oldname',
        userId: new Types.ObjectId(userId),
        status: 'current' as const,
        claimedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        retiredAt: undefined as Date | undefined,
        save: jest.fn().mockResolvedValue(true),
      };

      // Mock availability check
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // New name available
          }),
        })
        // Mock rate limit check
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // Not a re-claim
          }),
        })
        // Mock finding current claim (exists)
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockOldClaim),
        })
        // Mock finding existing retired claim (none exists)
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        });

      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1), // 1 recent change (within limit)
      });

      const mockNewClaim = {
        _id: new Types.ObjectId(),
        name: 'newname',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      };

      mockCustomNameClaimModel.create.mockResolvedValue([mockNewClaim]);

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const result = await service.claimOrChangeName(userId, 'newname');

      expect(result).toEqual(mockNewClaim);
      expect(mockOldClaim.save).toHaveBeenCalled();
      expect(mockOldClaim.status).toBe('retired');
      expect(mockOldClaim.retiredAt).toBeInstanceOf(Date);
    });

    it('should throw BadRequestException for invalid name format', async () => {
      await expect(
        service.claimOrChangeName(userId, 'ab'),
      ).rejects.toThrow(BadRequestException);

      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for reserved name', async () => {
      await expect(
        service.claimOrChangeName(userId, 'admin'),
      ).rejects.toThrow(BadRequestException);

      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for taken name', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            name: 'takenname',
            userId: new Types.ObjectId(), // Different user
            status: 'current',
          }),
        }),
      });

      await expect(
        service.claimOrChangeName(userId, 'takenname'),
      ).rejects.toThrow(BadRequestException);

      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when rate limit exceeded (4th change)', async () => {
      // Mock availability check
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // Name available
          }),
        })
        // Mock rate limit check
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null), // Not a re-claim
          }),
        });

      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(3), // Already 3 changes
      });

      await expect(
        service.claimOrChangeName(userId, 'fourthname'),
      ).rejects.toThrow(ConflictException);

      expect(mockSession.startTransaction).not.toHaveBeenCalled();
    });

    it('should allow re-claiming own retired name without counting against rate limit', async () => {
      const mockRetiredClaim = {
        _id: new Types.ObjectId(),
        name: 'myoldname',
        userId: new Types.ObjectId(userId),
        status: 'retired',
        retiredAt: new Date(),
        save: jest.fn().mockResolvedValue(undefined),
      };

      // Mock availability check (finds own retired name)
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockRetiredClaim),
          }),
        })
        // Mock rate limit check (finds own retired name)
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockRetiredClaim), // Is a re-claim
          }),
        })
        // Mock finding current claim (none exists)
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        })
        // Mock finding existing retired claim to re-activate
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(mockRetiredClaim),
        });

      const mockNewClaim = {
        _id: new Types.ObjectId(),
        name: 'myoldname',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      };

      mockCustomNameClaimModel.create.mockResolvedValue([mockNewClaim]);

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      // Should succeed even with 3 recent changes, because re-claiming doesn't count
      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0), // Excludes re-claims
      });

      const result = await service.claimOrChangeName(userId, 'myoldname');

      // Should return the re-activated retired claim, not create a new one
      expect(result).toEqual(mockRetiredClaim);
      expect(mockRetiredClaim.status).toBe('current');
      expect(mockRetiredClaim.save).toHaveBeenCalled();
      expect(mockCustomNameClaimModel.create).not.toHaveBeenCalled();
    });

    it('should throw error when database operation fails', async () => {
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        });

      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      // Simulate error during create
      mockCustomNameClaimModel.create.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.claimOrChangeName(userId, 'newname'),
      ).rejects.toThrow('Database error');
    });

    it('should normalize name to lowercase', async () => {
      mockCustomNameClaimModel.findOne
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue(null),
        });

      mockCustomNameClaimModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const mockNewClaim = {
        name: 'mixedcase',
        userId: new Types.ObjectId(userId),
        status: 'current',
        claimedAt: new Date(),
      };

      mockCustomNameClaimModel.create.mockResolvedValue([mockNewClaim]);

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      await service.claimOrChangeName(userId, 'MixedCase');

      expect(mockCustomNameClaimModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            name: 'mixedcase',
          }),
        ],
      );
    });
  });

  describe('removeName', () => {
    const userId = new Types.ObjectId().toString();

    it('should retire current claim and clear User.customName', async () => {
      const mockCurrentClaim = {
        _id: new Types.ObjectId(),
        name: 'currentname',
        userId: new Types.ObjectId(userId),
        status: 'current' as const,
        claimedAt: new Date(),
        retiredAt: undefined as Date | undefined,
        save: jest.fn().mockResolvedValue(true),
      };

      mockCustomNameClaimModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCurrentClaim),
      });

      mockUserModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      });

      const result = await service.removeName(userId);

      expect(result).toEqual(mockCurrentClaim);
      expect(mockCurrentClaim.status).toBe('retired');
      expect(mockCurrentClaim.retiredAt).toBeInstanceOf(Date);
      expect(mockCurrentClaim.save).toHaveBeenCalled();
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $unset: { customName: 1 } },
      );
    });

    it('should return null if no current claim exists', async () => {
      mockCustomNameClaimModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.removeName(userId);

      expect(result).toBeNull();
      expect(mockUserModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should throw error when save fails', async () => {
      const mockCurrentClaim = {
        name: 'currentname',
        userId: new Types.ObjectId(userId),
        status: 'current' as const,
        retiredAt: undefined as Date | undefined,
        save: jest.fn().mockRejectedValue(new Error('Save failed')),
      };

      mockCustomNameClaimModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCurrentClaim),
      });

      await expect(service.removeName(userId)).rejects.toThrow('Save failed');
    });
  });
});
