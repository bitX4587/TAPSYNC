import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Mode } from '@tapsync/shared';

import { User, UserDocument } from './schemas/user.schema.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UpdateModeDto } from './dto/update-mode.dto.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

/**
 * Service for user profile operations.
 *
 * Provides methods for retrieving and updating the authenticated user's profile.
 * Requirements: 2.4, 2.7
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly revalidationService: RevalidationService,
  ) {}

  /**
   * Convert a User document to a ProfileResponseDto.
   * Includes recovery method indicators for Requirement 1.9.
   *
   * @param user - The user document (must not be null).
   * @returns The profile response DTO.
   */
  private toProfileResponse(user: UserDocument): ProfileResponseDto {
    return {
      publicId: user.publicId,
      customName: user.customName,
      fullName: user.fullName,
      bio: user.bio,
      designation: user.designation,
      company: user.company,
      phone: user.phone,
      publicEmail: user.publicEmail,
      hiddenFields: user.hiddenFields,
      avatarUrl: user.avatarUrl,
      activeMode: user.activeMode,
      theme: user.theme,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Recovery method indicators (Requirement 1.9)
      hasEmailLinked: !!user.email && user.emailVerified,
      hasGoogleLinked: !!user.googleId,
      hasRecoveryCode: !!user.recoveryCodeHash,
    };
  }

  /**
   * Find the current user's profile by their ID.
   *
   * @param userId - The authenticated user's ID from the JWT payload.
   * @returns The user's profile data.
   * @throws NotFoundException if the user is not found.
   */
  async findMe(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash -refreshTokenHashes -__v')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toProfileResponse(user as UserDocument);
  }

  /**
   * Update the current user's profile.
   *
   * @param userId - The authenticated user's ID from the JWT payload.
   * @param updateDto - The profile fields to update.
   * @returns The updated profile data.
   * @throws NotFoundException if the user is not found.
   */
  async updateMe(
    userId: string,
    updateDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: updateDto },
        { new: true, runValidators: true },
      )
      .select('-passwordHash -refreshTokenHashes -__v')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Trigger revalidation of the public profile page (Requirements: 2.6)
    await this.revalidationService.revalidateProfile(user.publicId);

    return this.toProfileResponse(user as UserDocument);
  }

  /**
   * Update the user's avatar URL.
   *
   * @param userId - The authenticated user's ID from the JWT payload.
   * @param avatarUrl - The CDN URL of the uploaded avatar.
   * @returns The updated profile data.
   * @throws NotFoundException if the user is not found.
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<ProfileResponseDto> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { avatarUrl } },
        { new: true, runValidators: true },
      )
      .select('-passwordHash -refreshTokenHashes -__v')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Trigger revalidation of the public profile page (Requirements: 2.6)
    await this.revalidationService.revalidateProfile(user.publicId);

    return this.toProfileResponse(user as UserDocument);
  }

  /**
   * Update the user's active mode.
   *
   * Requirements: 4.1, 4.2
   * - Updates User.activeMode to the specified mode ('work' or 'casual')
   * - Returns the new mode value
   * - Triggers revalidation of the public profile page (Requirement 4.3)
   *
   * @param userId - The authenticated user's ID from the JWT payload.
   * @param updateModeDto - The mode to set.
   * @returns An object containing the new active mode.
   * @throws NotFoundException if the user is not found.
   */
  async updateMode(
    userId: string,
    updateModeDto: UpdateModeDto,
  ): Promise<{ mode: Mode }> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { activeMode: updateModeDto.mode } },
        { new: true, runValidators: true },
      )
      .select('activeMode publicId')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Trigger revalidation of the public profile page (Requirements: 4.3)
    await this.revalidationService.revalidateProfile(user.publicId);

    return { mode: user.activeMode as Mode };
  }

  /**
   * Soft-delete the authenticated user's account.
   *
   * Sets User.status to 'deleted', which causes the public profile to return 404.
   * Related data (ProfileLink, NfcCard, CustomNameClaim, AnalyticsEvent, NetworkContact)
   * remains in the database for eventual purge by a separate job (not implemented in this task).
   *
   * Requirements: 10.6
   * - Public page immediately returns 404
   * - Account cannot authenticate after deletion
   * - Actual data purge within 30 days (deferred to separate job)
   *
   * @param userId - The authenticated user's ID from the JWT payload.
   * @throws NotFoundException if the user is not found or already deleted.
   */
  async deleteAccount(userId: string): Promise<void> {
    const result = await this.userModel
      .updateOne(
        { _id: userId, status: { $ne: 'deleted' } },
        { $set: { status: 'deleted' } },
      )
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found or already deleted');
    }

    // NOTE: Related data (ProfileLink, NfcCard, CustomNameClaim, AnalyticsEvent, NetworkContact)
    // is NOT deleted here. A separate purge job will remove this data within 30 days.
    // This allows for potential account recovery and audit requirements.
  }
}
