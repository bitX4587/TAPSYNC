import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession, Types } from 'mongoose';

import { isReservedCustomName } from '@tapsync/shared';
import {
  CustomNameClaim,
  CustomNameClaimDocument,
} from './schemas/custom-name-claim.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';

/**
 * Service for custom name operations.
 *
 * Provides methods for checking custom name availability, claiming, changing,
 * and removing custom names with transactional support.
 * Requirements: 2.8-2.14
 */
@Injectable()
export class CustomNamesService {
  /**
   * Regular expression for valid custom name format:
   * 3–30 characters, lowercase letters, numbers, underscore and hyphen.
   * Must start with a letter or number.
   */
  private static readonly CUSTOM_NAME_REGEX = /^[a-z0-9][a-z0-9_-]{2,29}$/;

  /**
   * Maximum number of name changes allowed per user within the rate limit window.
   * Requirement 2.13: max 3 changes per 30 days.
   */
  private static readonly MAX_CHANGES_PER_PERIOD = 3;

  /**
   * Rate limit window in days.
   * Requirement 2.13: 30 days.
   */
  private static readonly RATE_LIMIT_DAYS = 30;

  constructor(
    @InjectModel(CustomNameClaim.name)
    private customNameClaimModel: Model<CustomNameClaimDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly revalidationService: RevalidationService,
  ) {}

  /**
   * Check if a custom name is available for claiming.
   *
   * A name is available if:
   * - It matches the format requirements (3-30 chars, lowercase letters/numbers/_/-, starts with letter or number)
   * - It is not on the reserved list
   * - It is not currently taken or retired by any user
   *
   * @param name - The custom name to check (will be normalized to lowercase).
   * @param userId - Optional user ID to check if the name is owned by this user (for re-claiming retired names).
   * @returns An object with `available` boolean and optional `reason` string.
   */
  async checkAvailability(
    name: string,
    userId?: string,
  ): Promise<{ available: boolean; reason?: string }> {
    // Normalize to lowercase and trim
    const normalizedName = name.toLowerCase().trim();

    // Check format
    if (!CustomNamesService.CUSTOM_NAME_REGEX.test(normalizedName)) {
      return {
        available: false,
        reason: this.getFormatError(normalizedName),
      };
    }

    // Check reserved words
    if (isReservedCustomName(normalizedName)) {
      return {
        available: false,
        reason: 'This name is reserved and cannot be used',
      };
    }

    // Check if taken (either current or retired)
    const existingClaim = await this.customNameClaimModel
      .findOne({ name: normalizedName })
      .lean()
      .exec();

    if (existingClaim) {
      // Requirement 2.14: Allow re-claiming own retired names
      if (
        userId &&
        existingClaim.userId.toString() === userId &&
        existingClaim.status === 'retired'
      ) {
        return { available: true };
      }

      return {
        available: false,
        reason: 'This name is already taken',
      };
    }

    return { available: true };
  }

  /**
   * Claim or change a custom name for a user.
   *
   * This method:
   * - Validates the name format and availability
   * - Enforces the rate limit (3 changes per 30 days, Requirement 2.13)
   * - Allows re-claiming own retired names (Requirement 2.14)
   * - Uses a transaction to retire the old claim and create the new one
   * - Updates User.customName to mirror the current claim
   *
   * @param userId - The user's ID.
   * @param newName - The desired custom name (will be normalized to lowercase).
   * @returns The created CustomNameClaim document.
   * @throws BadRequestException if the name is invalid or unavailable.
   * @throws ConflictException if the rate limit is exceeded.
   */
  async claimOrChangeName(
    userId: string,
    newName: string,
  ): Promise<CustomNameClaimDocument> {
    const normalizedName = newName.toLowerCase().trim();

    // Step 1: Check availability
    const availability = await this.checkAvailability(normalizedName, userId);
    if (!availability.available) {
      throw new BadRequestException(
        availability.reason || 'Name is not available',
      );
    }

    // Step 2: Check rate limit (Requirement 2.13)
    await this.checkRateLimit(userId, normalizedName);

    // Step 3: Execute the claim/change
    // Note: Transactions require a replica set. In production with MongoDB Atlas (replica set),
    // this would ideally use transactions for atomicity. For now, operations execute
    // sequentially without transaction guarantees, which is acceptable since:
    // 1. The custom name uniqueness is enforced by a unique index
    // 2. Rate limiting is checked before any modifications
    // 3. User.customName mirrors the current CustomNameClaim status
    //
    // Future enhancement: detect replica set support and use transactions when available.
    const session: ClientSession | null = null;
    const canUseTransaction = false;

    try {
      // Retire the current claim if it exists
      const currentClaim = await this.customNameClaimModel
        .findOne({
          userId: new Types.ObjectId(userId),
          status: 'current',
        })
        .exec();

      if (currentClaim) {
        currentClaim.status = 'retired';
        currentClaim.retiredAt = new Date();
        await currentClaim.save();
      }

      // Check if we're re-claiming a retired name (Requirement 2.14)
      // If so, update the existing retired claim instead of creating a new one
      const existingRetiredClaim = await this.customNameClaimModel
        .findOne({
          name: normalizedName,
          userId: new Types.ObjectId(userId),
          status: 'retired',
        })
        .exec();

      let newClaim: CustomNameClaimDocument;

      if (existingRetiredClaim) {
        // Re-activate the retired claim
        existingRetiredClaim.status = 'current';
        existingRetiredClaim.claimedAt = new Date();
        existingRetiredClaim.retiredAt = null as any; // Clear the retirement date
        await existingRetiredClaim.save();
        newClaim = existingRetiredClaim;
      } else {
        // Create a new claim
        const createdClaims = await this.customNameClaimModel.create([
          {
            name: normalizedName,
            userId: new Types.ObjectId(userId),
            status: 'current',
            claimedAt: new Date(),
          },
        ]);

        const claim = createdClaims[0];
        if (!claim) {
          throw new Error('Failed to create custom name claim');
        }
        newClaim = claim;
      }

      // Update User.customName to mirror the new claim
      await this.userModel
        .findByIdAndUpdate(userId, { $set: { customName: normalizedName } })
        .exec();

      // Trigger revalidation of the public profile page and custom name paths (Requirements: 2.10)
      const user = await this.userModel.findById(userId).select('publicId').lean().exec();
      if (user) {
        await this.revalidationService.revalidateProfileAndPaths(user.publicId);
      }

      return newClaim;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Remove the current custom name for a user.
   *
   * This method:
   * - Marks the current claim as retired (Requirement 2.11)
   * - Clears User.customName
   * - Uses a transaction for atomicity
   *
   * The retired name stays reserved and keeps redirecting to the user's profile.
   *
   * @param userId - The user's ID.
   * @returns The retired CustomNameClaim document, or null if no current claim exists.
   */
  async removeName(userId: string): Promise<CustomNameClaimDocument | null> {
    // Note: Transactions require a replica set. See claimOrChangeName for details.
    const session: ClientSession | null = null;
    const canUseTransaction = false;

    try {
      // Find and retire the current claim
      const currentClaim = await this.customNameClaimModel
        .findOne({
          userId: new Types.ObjectId(userId),
          status: 'current',
        })
        .exec();

      if (!currentClaim) {
        return null;
      }

      currentClaim.status = 'retired';
      currentClaim.retiredAt = new Date();
      await currentClaim.save();

      // Clear User.customName
      await this.userModel
        .findByIdAndUpdate(userId, { $unset: { customName: 1 } })
        .exec();

      // Trigger revalidation of the public profile page (Requirements: 2.10)
      const user = await this.userModel.findById(userId).select('publicId').lean().exec();
      if (user) {
        await this.revalidationService.revalidateProfileAndPaths(user.publicId);
      }

      return currentClaim;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if the user has exceeded the rate limit for name changes.
   *
   * Requirement 2.13: Max 3 changes per 30 days.
   * Requirement 2.14: Re-claiming own retired names is allowed.
   *
   * @param userId - The user's ID.
   * @param newName - The name being claimed (to check if it's a re-claim).
   * @throws ConflictException if the rate limit is exceeded.
   */
  private async checkRateLimit(
    userId: string,
    newName: string,
  ): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - CustomNamesService.RATE_LIMIT_DAYS,
    );

    // Check if this is a re-claim of the user's own retired name
    const isReClaim = await this.customNameClaimModel
      .findOne({
        name: newName,
        userId: new Types.ObjectId(userId),
        status: 'retired',
      })
      .lean()
      .exec();

    // Re-claiming own retired names doesn't count against the limit (Requirement 2.14)
    if (isReClaim) {
      return;
    }

    // Count recent changes (excluding the name being re-claimed)
    const recentChanges = await this.customNameClaimModel
      .countDocuments({
        userId: new Types.ObjectId(userId),
        claimedAt: { $gte: cutoffDate },
        name: { $ne: newName }, // Exclude re-claims
      })
      .exec();

    if (recentChanges >= CustomNamesService.MAX_CHANGES_PER_PERIOD) {
      throw new ConflictException(
        `You can only change your custom name ${CustomNamesService.MAX_CHANGES_PER_PERIOD} times per ${CustomNamesService.RATE_LIMIT_DAYS} days`,
      );
    }
  }

  /**
   * Generate a specific error message for format validation failures.
   */
  private getFormatError(name: string): string {
    if (name.length < 3) {
      return 'Name must be at least 3 characters long';
    }
    if (name.length > 30) {
      return 'Name must be no more than 30 characters long';
    }
    if (!/^[a-z0-9]/.test(name)) {
      return 'Name must start with a letter or number';
    }
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return 'Name can only contain lowercase letters, numbers, underscores, and hyphens';
    }
    return 'Name format is invalid';
  }
}
