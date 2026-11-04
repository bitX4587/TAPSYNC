import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Mode } from '@tapsync/shared';

import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { MediaService } from '../media/media.service.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUserId = '507f1f77bcf86cd799439011';
  const mockProfileResponse: ProfileResponseDto = {
    publicId: 'abc1234567',
    customName: 'johndoe',
    fullName: 'John Doe',
    bio: 'Software engineer',
    designation: 'Senior Developer',
    company: 'TechCorp',
    phone: '+1234567890',
    publicEmail: 'john@example.com',
    hiddenFields: [],
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
    activeMode: 'work',
    theme: 'dark',
    status: 'active',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
  };

  const mockUsersService = {
    findMe: jest.fn(),
    updateMe: jest.fn(),
    updateMode: jest.fn(),
  };

  const mockMediaService = {
    uploadAvatar: jest.fn(),
  };

  const mockRequest = {
    user: { userId: mockUserId, publicId: 'abc1234567' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('should return the current user profile', async () => {
      mockUsersService.findMe.mockResolvedValue(mockProfileResponse);

      const result = await controller.getMe(mockRequest);

      expect(service.findMe).toHaveBeenCalledWith(mockUserId);
      expect(result).toEqual(mockProfileResponse);
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.findMe.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(controller.getMe(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateMe', () => {
    it('should update user profile and return updated data', async () => {
      const updateDto: UpdateProfileDto = {
        fullName: 'Jane Doe',
        bio: 'Updated bio',
      };

      const updatedProfile = {
        ...mockProfileResponse,
        fullName: 'Jane Doe',
        bio: 'Updated bio',
      };

      mockUsersService.updateMe.mockResolvedValue(updatedProfile);

      const result = await controller.updateMe(mockRequest, updateDto);

      expect(service.updateMe).toHaveBeenCalledWith(mockUserId, updateDto);
      expect(result).toEqual(updatedProfile);
      expect(result.fullName).toBe('Jane Doe');
      expect(result.bio).toBe('Updated bio');
    });

    it('should handle hiddenFields update', async () => {
      const updateDto: UpdateProfileDto = {
        hiddenFields: ['phone', 'publicEmail'],
      };

      const updatedProfile = {
        ...mockProfileResponse,
        hiddenFields: ['phone', 'publicEmail'] as ('phone' | 'publicEmail')[],
      };

      mockUsersService.updateMe.mockResolvedValue(updatedProfile);

      const result = await controller.updateMe(mockRequest, updateDto);

      expect(service.updateMe).toHaveBeenCalledWith(mockUserId, updateDto);
      expect(result.hiddenFields).toEqual(['phone', 'publicEmail']);
    });

    it('should handle theme update', async () => {
      const updateDto: UpdateProfileDto = {
        theme: 'light',
      };

      const updatedProfile = {
        ...mockProfileResponse,
        theme: 'light' as const,
      };

      mockUsersService.updateMe.mockResolvedValue(updatedProfile);

      const result = await controller.updateMe(mockRequest, updateDto);

      expect(service.updateMe).toHaveBeenCalledWith(mockUserId, updateDto);
      expect(result.theme).toBe('light');
    });

    it('should handle empty update object', async () => {
      const updateDto: UpdateProfileDto = {};

      mockUsersService.updateMe.mockResolvedValue(mockProfileResponse);

      const result = await controller.updateMe(mockRequest, updateDto);

      expect(service.updateMe).toHaveBeenCalledWith(mockUserId, updateDto);
      expect(result).toEqual(mockProfileResponse);
    });

    it('should propagate NotFoundException from service', async () => {
      const updateDto: UpdateProfileDto = {
        fullName: 'Jane Doe',
      };

      mockUsersService.updateMe.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.updateMe(mockRequest, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMode', () => {
    it('should update active mode to casual', async () => {
      mockUsersService.updateMode.mockResolvedValue({ mode: 'casual' });

      const result = await controller.updateMode(mockRequest, { mode: Mode.Casual });

      expect(service.updateMode).toHaveBeenCalledWith(mockUserId, { mode: Mode.Casual });
      expect(result).toEqual({ mode: 'casual' });
    });

    it('should update active mode to work', async () => {
      mockUsersService.updateMode.mockResolvedValue({ mode: 'work' });

      const result = await controller.updateMode(mockRequest, { mode: Mode.Work });

      expect(service.updateMode).toHaveBeenCalledWith(mockUserId, { mode: Mode.Work });
      expect(result).toEqual({ mode: 'work' });
    });

    it('should propagate NotFoundException from service', async () => {
      mockUsersService.updateMode.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.updateMode(mockRequest, { mode: Mode.Casual }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should correctly pass userId from request to service', async () => {
      mockUsersService.updateMode.mockResolvedValue({ mode: 'work' });

      await controller.updateMode(mockRequest, { mode: Mode.Work });

      expect(service.updateMode).toHaveBeenCalledWith(mockUserId, { mode: Mode.Work });
    });
  });
});
