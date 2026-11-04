/**
 * Unit tests for MediaService
 *
 * Tests avatar upload validation, resizing, and storage operations.
 *
 * Requirements: 2.5
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { MediaService } from './media.service';
import { AppConfigService } from '../config/app-config.service';

// Mock sharp
jest.mock('sharp');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');

describe('MediaService', () => {
  let service: MediaService;
  let mockConfigService: Partial<AppConfigService>;
  let mockS3Send: jest.Mock;

  beforeEach(async () => {
    // Create mock config service
    mockConfigService = {
      storageBucket: 'test-bucket',
      storageRegion: 'us-east-1',
      storageKeyId: 'test-key-id',
      storageSecret: 'test-secret',
      storageCdnUrl: 'https://cdn.example.com',
    };

    // Mock S3 client send method
    mockS3Send = jest.fn().mockResolvedValue({});
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('uploadAvatar', () => {
    const userId = '507f1f77bcf86cd799439011';

    // Helper to create mock file
    function createMockFile(
      mimetype: string,
      size: number,
      buffer?: Buffer,
    ): Express.Multer.File {
      return {
        fieldname: 'avatar',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype,
        size,
        buffer: buffer || Buffer.from('fake-image-data'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };
    }

    // Helper to create mock sharp instance
    function createMockSharp() {
      const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('resized-image'));
      const mockJpeg = jest.fn().mockReturnValue({ toBuffer: mockToBuffer });
      const mockResize = jest.fn().mockReturnValue({ jpeg: mockJpeg });

      return {
        resize: mockResize,
        jpeg: mockJpeg,
        toBuffer: mockToBuffer,
      };
    }

    it('should upload a valid JPEG avatar successfully', async () => {
      const file = createMockFile('image/jpeg', 1024 * 1024); // 1 MB
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await service.uploadAvatar(userId, file);

      // Verify sharp was called with the file buffer
      expect(sharp).toHaveBeenCalledWith(file.buffer);

      // Verify resize was called with correct dimensions
      expect(mockSharp.resize).toHaveBeenCalledWith(512, 512, {
        fit: 'cover',
        position: 'center',
      });

      // Verify JPEG conversion
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });

      // Verify S3 upload was called
      expect(mockS3Send).toHaveBeenCalled();

      // Verify result is a CDN URL
      expect(result).toMatch(/^https:\/\/cdn\.example\.com\/avatars\//);
      expect(result).toMatch(/\.jpg$/);
    });

    it('should upload a valid PNG avatar successfully', async () => {
      const file = createMockFile('image/png', 2 * 1024 * 1024); // 2 MB
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await service.uploadAvatar(userId, file);

      expect(result).toMatch(/^https:\/\/cdn\.example\.com\/avatars\//);
      expect(sharp).toHaveBeenCalledWith(file.buffer);
    });

    it('should upload a valid WebP avatar successfully', async () => {
      const file = createMockFile('image/webp', 1024 * 512); // 512 KB
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await service.uploadAvatar(userId, file);

      expect(result).toMatch(/^https:\/\/cdn\.example\.com\/avatars\//);
      expect(sharp).toHaveBeenCalledWith(file.buffer);
    });

    it('should reject unsupported file types', async () => {
      const file = createMockFile('image/gif', 1024); // GIF not allowed

      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        'Invalid file type. Only JPEG, PNG, and WebP are allowed.',
      );

      expect(sharp).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should reject files exceeding 5MB', async () => {
      const file = createMockFile('image/jpeg', 6 * 1024 * 1024); // 6 MB

      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        'File too large. Maximum size is 5MB.',
      );

      expect(sharp).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should accept file at exactly 5MB', async () => {
      const file = createMockFile('image/jpeg', 5 * 1024 * 1024); // Exactly 5 MB
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await service.uploadAvatar(userId, file);

      expect(result).toMatch(/^https:\/\/cdn\.example\.com\/avatars\//);
      expect(sharp).toHaveBeenCalled();
    });

    it('should reject invalid MIME types', async () => {
      const invalidMimeTypes = [
        'application/pdf',
        'text/plain',
        'image/svg+xml',
        'video/mp4',
        'application/octet-stream',
      ];

      for (const mimetype of invalidMimeTypes) {
        const file = createMockFile(mimetype, 1024);

        await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
          BadRequestException,
        );
      }

      expect(sharp).not.toHaveBeenCalled();
    });

    it('should resize image to 512x512 with cover fit', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      await service.uploadAvatar(userId, file);

      expect(mockSharp.resize).toHaveBeenCalledWith(512, 512, {
        fit: 'cover',
        position: 'center',
      });
    });

    it('should convert all images to JPEG with 85% quality', async () => {
      const file = createMockFile('image/png', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      await service.uploadAvatar(userId, file);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should generate unique filenames for each upload', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result1 = await service.uploadAvatar(userId, file);
      const result2 = await service.uploadAvatar(userId, file);

      expect(result1).not.toBe(result2);
      expect(result1).toMatch(new RegExp(`avatars/${userId}-\\d+-[a-f0-9]+\\.jpg`));
      expect(result2).toMatch(new RegExp(`avatars/${userId}-\\d+-[a-f0-9]+\\.jpg`));
    });

    it('should upload to S3 with correct parameters', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      await service.uploadAvatar(userId, file);

      expect(mockS3Send).toHaveBeenCalled();
      // Verify PutObjectCommand was created with correct parameters
      const PutObjectCommand = require('@aws-sdk/client-s3').PutObjectCommand;
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          ContentType: 'image/jpeg',
          ACL: 'public-read',
        }),
      );
    });

    it('should return CDN URL when configured', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await service.uploadAvatar(userId, file);

      expect(result).toMatch(/^https:\/\/cdn\.example\.com\//);
    });

    it('should return S3 URL when CDN not configured', async () => {
      // Create service without CDN URL
      const mockConfigServiceNoCdn: Partial<AppConfigService> = {
        storageBucket: 'test-bucket',
        storageRegion: 'us-east-1',
        storageKeyId: 'test-key-id',
        storageSecret: 'test-secret',
        storageCdnUrl: undefined,
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MediaService,
          {
            provide: AppConfigService,
            useValue: mockConfigServiceNoCdn,
          },
        ],
      }).compile();

      const serviceNoCdn = module.get<MediaService>(MediaService);

      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      const result = await serviceNoCdn.uploadAvatar(userId, file);

      expect(result).toMatch(/^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\//);
    });

    it('should handle sharp processing errors', async () => {
      const file = createMockFile('image/jpeg', 1024);
      (sharp as any).mockImplementation(() => {
        throw new Error('Sharp processing failed');
      });

      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        'Failed to upload avatar',
      );
    });

    it('should handle S3 upload errors', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      mockS3Send.mockRejectedValue(new Error('S3 upload failed'));

      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        'Failed to upload avatar',
      );
    });

    it('should handle corrupted image files', async () => {
      const file = createMockFile('image/jpeg', 1024, Buffer.from('not-an-image'));
      (sharp as any).mockImplementation(() => {
        throw new Error('Input buffer contains unsupported image format');
      });

      await expect(service.uploadAvatar(userId, file)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should include userId in filename for organization', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      await service.uploadAvatar(userId, file);

      // Verify PutObjectCommand was created with a Key containing userId
      const PutObjectCommand = require('@aws-sdk/client-s3').PutObjectCommand;
      const lastCall = (PutObjectCommand as jest.Mock).mock.calls[
        (PutObjectCommand as jest.Mock).mock.calls.length - 1
      ];
      expect(lastCall[0].Key).toContain(userId);
    });

    it('should set public-read ACL for accessibility', async () => {
      const file = createMockFile('image/jpeg', 1024);
      const mockSharp = createMockSharp();
      (sharp as any).mockReturnValue(mockSharp);

      await service.uploadAvatar(userId, file);

      // Verify PutObjectCommand was created with public-read ACL
      const PutObjectCommand = require('@aws-sdk/client-s3').PutObjectCommand;
      const lastCall = (PutObjectCommand as jest.Mock).mock.calls[
        (PutObjectCommand as jest.Mock).mock.calls.length - 1
      ];
      expect(lastCall[0].ACL).toBe('public-read');
    });
  });
});
