/**
 * Unit tests for UsersService
 *
 * Tests the core business logic for profile operations including field validation,
 * hidden fields, and account deletion.
 *
 * Requirements: 2.4, 2.7, 4.1, 4.2, 10.6
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Mode } from '@tapsync/shared';

import { UsersService } from './users.service';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RevalidationService } from '../revalidation/revalidation.service';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: Model<UserDocument>;

  // Mock user data
  const mockUserId = '507f1f77bcf86cd799439011';
  const mockUser = {
    _id: mockUserId,
    publicId: 'abc123xyz',
    email: 'test@example.com',
    emailVerified: true,
    fullName: 'Test User',
    bio: 'Test bio',
    designation: 'Engineer',
    company: 'TechCorp',
    phone: '+1234567890',
    publicEmail: 'public@example.com',
    hiddenFields: [],
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
    activeMode: 'work' as const,
    theme: 'system' as const,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mock Mongoose model methods
  const mockExec = jest.fn();
  const mockLean = jest.fn(() => ({ exec: mockExec }));
  const mockSelect = jest.fn(() => ({ lean: mockLean, exec: mockExec }));
  const mockFindById = jest.fn(() => ({ select: mockSelect }));
  const mockFindByIdAndUpdate = jest.fn(() => ({ select: mockSelect }));
  const mockUpdateOne = jest.fn(() => ({ exec: mockExec }));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: mockFindById,
            findByIdAndUpdate: mockFindByIdAndUpdate,
            updateOne: mockUpdateOne,
          },
        },
        {
          provide: RevalidationService,
          useValue: {
            revalidateProfile: jest.fn().mockResolvedValue(undefined),
            revalidateProfileAndPaths: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('findMe', () => {
    it('should return user profile without sensitive fields', async () => {
      mockExec.mockResolvedValue(mockUser);

      const result = await service.findMe(mockUserId);

      expect(result).toEqual({
        publicId: mockUser.publicId,
        customName: undefined,
        fullName: mockUser.fullName,
        bio: mockUser.bio,
        designation: mockUser.designation,
        company: mockUser.company,
        phone: mockUser.phone,
        publicEmail: mockUser.publicEmail,
        hiddenFields: mockUser.hiddenFields,
        avatarUrl: mockUser.avatarUrl,
        activeMode: mockUser.activeMode,
        theme: mockUser.theme,
        status: mockUser.status,
        hasEmailLinked: true,
        hasGoogleLinked: false,
        hasRecoveryCode: false,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });

      expect(mockFindById).toHaveBeenCalledWith(mockUserId);
      expect(mockSelect).toHaveBeenCalledWith(
        '-passwordHash -recoveryCodeHash -refreshTokenHashes -__v',
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockExec.mockResolvedValue(null);

      await expect(service.findMe(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findMe(mockUserId)).rejects.toThrow('User not found');
    });

    it('should include custom name if set', async () => {
      const userWithCustomName = { ...mockUser, customName: 'myhandle' };
      mockExec.mockResolvedValue(userWithCustomName);

      const result = await service.findMe(mockUserId);

      expect(result.customName).toBe('myhandle');
    });
  });

  describe('updateMe', () => {
    it('should update profile fields and return updated profile', async () => {
      const updateDto: UpdateProfileDto = {
        fullName: 'Updated Name',
        bio: 'Updated bio',
      };

      mockExec.mockResolvedValue({ ...mockUser, ...updateDto });

      const result = await service.updateMe(mockUserId, updateDto);

      expect(result.fullName).toBe('Updated Name');
      expect(result.bio).toBe('Updated bio');

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $set: updateDto },
        { new: true, runValidators: true },
      );
    });

    it('should update hidden fields', async () => {
      const updateDto: UpdateProfileDto = {
        hiddenFields: ['phone', 'publicEmail'],
      };

      mockExec.mockResolvedValue({ ...mockUser, ...updateDto });

      const result = await service.updateMe(mockUserId, updateDto);

      expect(result.hiddenFields).toEqual(['phone', 'publicEmail']);
    });

    it('should update theme preference', async () => {
      const updateDto: UpdateProfileDto = {
        theme: 'dark',
      };

      mockExec.mockResolvedValue({ ...mockUser, theme: 'dark' });

      const result = await service.updateMe(mockUserId, updateDto);

      expect(result.theme).toBe('dark');
    });

    it('should handle empty update object', async () => {
      mockExec.mockResolvedValue(mockUser);

      const result = await service.updateMe(mockUserId, {});

      expect(result.publicId).toBe(mockUser.publicId);
      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $set: {} },
        { new: true, runValidators: true },
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockExec.mockResolvedValue(null);

      const updateDto: UpdateProfileDto = { fullName: 'Test' };

      await expect(service.updateMe(mockUserId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update multiple fields atomically', async () => {
      const updateDto: UpdateProfileDto = {
        fullName: 'John Doe',
        bio: 'Software Engineer',
        designation: 'Senior Dev',
        company: 'BigCo',
        phone: '+9876543210',
        publicEmail: 'john@example.com',
        hiddenFields: ['phone'],
        theme: 'dark',
      };

      mockExec.mockResolvedValue({ ...mockUser, ...updateDto });

      const result = await service.updateMe(mockUserId, updateDto);

      expect(result).toMatchObject({
        fullName: 'John Doe',
        bio: 'Software Engineer',
        designation: 'Senior Dev',
        company: 'BigCo',
        phone: '+9876543210',
        publicEmail: 'john@example.com',
        theme: 'dark',
      });
      expect(result.hiddenFields).toEqual(['phone']);
    });
  });

  describe('updateAvatar', () => {
    it('should update avatar URL and return updated profile', async () => {
      const avatarUrl = 'https://cdn.example.com/new-avatar.jpg';

      mockExec.mockResolvedValue({ ...mockUser, avatarUrl });

      const result = await service.updateAvatar(mockUserId, avatarUrl);

      expect(result.avatarUrl).toBe(avatarUrl);

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $set: { avatarUrl } },
        { new: true, runValidators: true },
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockExec.mockResolvedValue(null);

      await expect(
        service.updateAvatar(mockUserId, 'https://cdn.example.com/avatar.jpg'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMode', () => {
    it('should update active mode to casual', async () => {
      const updatedUser = { activeMode: 'casual' as const, publicId: 'abc123xyz' };
      mockExec.mockResolvedValue(updatedUser);

      const result = await service.updateMode(mockUserId, { mode: Mode.Casual });

      expect(result).toEqual({ mode: 'casual' });

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $set: { activeMode: Mode.Casual } },
        { new: true, runValidators: true },
      );
      expect(mockSelect).toHaveBeenCalledWith('activeMode publicId');
    });

    it('should update active mode to work', async () => {
      const updatedUser = { activeMode: 'work' as const, publicId: 'abc123xyz' };
      mockExec.mockResolvedValue(updatedUser);

      const result = await service.updateMode(mockUserId, { mode: Mode.Work });

      expect(result).toEqual({ mode: 'work' });

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $set: { activeMode: Mode.Work } },
        { new: true, runValidators: true },
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockExec.mockResolvedValue(null);

      await expect(
        service.updateMode(mockUserId, { mode: Mode.Casual }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateMode(mockUserId, { mode: Mode.Casual }),
      ).rejects.toThrow('User not found');
    });

    it('should correctly switch from work to casual', async () => {
      const updatedUser = { activeMode: 'casual' as const, publicId: 'abc123xyz' };
      mockExec.mockResolvedValue(updatedUser);

      const result = await service.updateMode(mockUserId, { mode: Mode.Casual });

      expect(result.mode).toBe('casual');
    });

    it('should correctly switch from casual to work', async () => {
      const updatedUser = { activeMode: 'work' as const, publicId: 'abc123xyz' };
      mockExec.mockResolvedValue(updatedUser);

      const result = await service.updateMode(mockUserId, { mode: Mode.Work });

      expect(result.mode).toBe('work');
    });

    it('should return only the mode field', async () => {
      const updatedUser = { activeMode: 'casual' as const, publicId: 'abc123xyz' };
      mockExec.mockResolvedValue(updatedUser);

      const result = await service.updateMode(mockUserId, { mode: Mode.Casual });

      expect(Object.keys(result)).toEqual(['mode']);
      expect(result).not.toHaveProperty('publicId');
      expect(result).not.toHaveProperty('fullName');
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete user account', async () => {
      mockExec.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await service.deleteAccount(mockUserId);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: mockUserId, status: { $ne: 'deleted' } },
        { $set: { status: 'deleted' } },
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockExec.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(service.deleteAccount(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteAccount(mockUserId)).rejects.toThrow(
        'User not found or already deleted',
      );
    });

    it('should throw NotFoundException if user already deleted', async () => {
      mockExec.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(service.deleteAccount(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not actually remove user data (soft delete only)', async () => {
      mockExec.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      await service.deleteAccount(mockUserId);

      // Verify updateOne is used (not deleteOne)
      expect(mockUpdateOne).toHaveBeenCalled();
      expect(userModel.findById).not.toHaveBeenCalled();
    });
  });
});
