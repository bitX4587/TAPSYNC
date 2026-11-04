import {
  Injectable,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import sharp from 'sharp';

import { AppConfigService } from '../config/app-config.service.js';

/**
 * Service for handling media uploads (avatars).
 *
 * Validates file type and size, resizes images, and uploads to S3-compatible storage.
 * Requirements: 2.5
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly cdnUrl: string | undefined;

  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  private readonly AVATAR_SIZE = 512; // 512x512 px

  constructor(private readonly config: AppConfigService) {
    this.bucket = this.config.storageBucket;
    this.cdnUrl = this.config.storageCdnUrl;

    this.s3Client = new S3Client({
      region: this.config.storageRegion,
      credentials: {
        accessKeyId: this.config.storageKeyId,
        secretAccessKey: this.config.storageSecret,
      },
    });
  }

  /**
   * Uploads an avatar for a user.
   *
   * Steps:
   * 1. Validate MIME type (JPEG, PNG, WebP)
   * 2. Validate size (max 5MB)
   * 3. Resize to 512x512 using sharp
   * 4. Generate unique filename
   * 5. Upload to S3-compatible storage
   * 6. Return CDN URL
   *
   * @param userId - The user's ID for generating unique filenames
   * @param file - The uploaded file from multer
   * @returns The CDN URL of the uploaded avatar
   * @throws BadRequestException if validation fails
   * @throws InternalServerErrorException if upload fails
   */
  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    // 1. Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Only JPEG, PNG, and WebP are allowed.`,
      );
    }

    // 2. Validate size
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB.`,
      );
    }

    try {
      // 3. Resize to 512x512 using sharp
      const resizedBuffer = await sharp(file.buffer)
        .resize(this.AVATAR_SIZE, this.AVATAR_SIZE, {
          fit: 'cover', // Crop to fill the square
          position: 'center',
        })
        .jpeg({ quality: 85 }) // Convert to JPEG for consistency
        .toBuffer();

      // 4. Generate unique filename
      const filename = this.generateFilename(userId);
      const key = `avatars/${filename}`;

      // 5. Upload to S3
      await this.uploadToS3(key, resizedBuffer, 'image/jpeg');

      // 6. Return CDN URL or S3 URL
      return this.buildUrl(key);
    } catch (error) {
      this.logger.error(
        `Failed to upload avatar for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to upload avatar');
    }
  }

  /**
   * Generates a unique filename for an avatar.
   *
   * Format: {userId}-{timestamp}-{hash}.jpg
   *
   * @param userId - The user's ID
   * @returns The generated filename
   */
  private generateFilename(userId: string): string {
    const timestamp = Date.now();
    const randomHash = crypto.randomBytes(8).toString('hex');
    return `${userId}-${timestamp}-${randomHash}.jpg`;
  }

  /**
   * Uploads a buffer to S3-compatible storage.
   *
   * @param key - The S3 object key
   * @param buffer - The file buffer
   * @param contentType - The MIME type
   */
  private async uploadToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Make the file publicly readable
      ACL: 'public-read',
    });

    await this.s3Client.send(command);
  }

  /**
   * Builds the full URL for an uploaded file.
   *
   * Uses CDN URL if configured, otherwise falls back to S3 URL.
   *
   * @param key - The S3 object key
   * @returns The full URL
   */
  private buildUrl(key: string): string {
    if (this.cdnUrl) {
      // Use CDN URL if configured
      return `${this.cdnUrl}/${key}`;
    }

    // Fall back to S3 URL
    const region = this.config.storageRegion;
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
