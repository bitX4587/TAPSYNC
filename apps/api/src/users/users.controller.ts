import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Mode } from '@tapsync/shared';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MediaService } from '../media/media.service.js';
import { UsersService } from './users.service.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UpdateModeDto } from './dto/update-mode.dto.js';

/**
 * Controller for user profile endpoints.
 *
 * All endpoints require authentication via JwtAuthGuard.
 * Requirements: 2.4, 2.5, 2.7
 */
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * GET /user/me
   *
   * Returns the current authenticated user's profile.
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @returns The user's profile data.
   */
  @Get('me')
  async getMe(@Req() req: Request): Promise<ProfileResponseDto> {
    const userId = (req.user as { userId: string }).userId;
    return this.usersService.findMe(userId);
  }

  /**
   * PATCH /user/me
   *
   * Updates the current authenticated user's profile.
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @param updateDto - The profile fields to update (all optional).
   * @returns The updated profile data.
   */
  @Patch('me')
  async updateMe(
    @Req() req: Request,
    @Body() updateDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const userId = (req.user as { userId: string }).userId;
    return this.usersService.updateMe(userId, updateDto);
  }

  /**
   * POST /user/me/avatar
   *
   * Uploads and updates the current authenticated user's avatar.
   * Accepts multipart/form-data with an 'avatar' field.
   *
   * Requirements: 2.5
   * - Accepts JPEG, PNG, WebP up to 5MB
   * - Resizes to 512x512
   * - Stores in S3-compatible storage
   * - Returns CDN URL
   * - Updates User.avatarUrl
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @param file - The uploaded avatar file from multer.
   * @returns The updated profile with the new avatar URL.
   * @throws BadRequestException if no file is uploaded or validation fails.
   */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @Req() req: Request,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProfileResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const userId = (req.user as { userId: string }).userId;

    // Upload and get CDN URL
    const avatarUrl = await this.mediaService.uploadAvatar(userId, file);

    // Update user's avatarUrl
    return this.usersService.updateAvatar(userId, avatarUrl);
  }

  /**
   * PATCH /user/mode
   *
   * Toggles the user's active mode between 'work' and 'casual'.
   * The mode determines which set of links is shown on the public profile page.
   *
   * Requirements: 4.1, 4.2
   * - Requirement 4.1: The system SHALL store exactly one Active Mode per Owner, defaulting to `work`.
   * - Requirement 4.2: WHEN an Owner calls the mode toggle with `work` or `casual` THEN the system SHALL update the Active Mode and return the new value.
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @param updateModeDto - The mode to set ('work' or 'casual').
   * @returns An object containing the new active mode.
   */
  @Patch('mode')
  async updateMode(
    @Req() req: Request,
    @Body() updateModeDto: UpdateModeDto,
  ): Promise<{ mode: Mode }> {
    const userId = (req.user as { userId: string }).userId;
    return this.usersService.updateMode(userId, updateModeDto);
  }

  /**
   * DELETE /user/me
   *
   * Soft-deletes the current authenticated user's account.
   *
   * Requirements: 10.6
   * - Sets User.status to 'deleted'
   * - Public profile immediately returns 404
   * - Account cannot authenticate after deletion
   * - Related data remains for eventual purge within 30 days (separate job)
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @returns 204 No Content on success.
   * @throws NotFoundException if the user is not found or already deleted.
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Req() req: Request): Promise<void> {
    const userId = (req.user as { userId: string }).userId;
    await this.usersService.deleteAccount(userId);
  }
}
