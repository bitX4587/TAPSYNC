import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CustomNameClaim } from '../../custom-names/schemas/custom-name-claim.schema.js';
import { ProfileLink } from '../../links/schemas/profile-link.schema.js';
import { User } from '../../users/schemas/user.schema.js';
import {
  CustomNameResponseDto,
  PublicContactDto,
  PublicLinkDto,
  PublicProfileDto,
} from '../dto/public-profile.dto.js';

// ---------------------------------------------------------------------------
// Public Service
//
// Provides read-only access to profiles for unauthenticated visitors.
// Filters by activeMode, hiddenFields, and user status.
//
// Requirements: 5.1–5.3, 5.11, 6.1–6.5
// ---------------------------------------------------------------------------

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(ProfileLink.name) private linkModel: Model<ProfileLink>,
    @InjectModel(CustomNameClaim.name)
    private customNameClaimModel: Model<CustomNameClaim>,
  ) {}

  /**
   * Get a public profile by Public ID.
   * Returns 404 if the user doesn't exist or is suspended/deleted.
   *
   * Requirement 5.1, 5.2, 5.3 — filter by active mode, enabled links, hidden fields.
   *
   * @param publicId - The user's immutable public identifier
   * @returns Public profile DTO with filtered links and contact
   * @throws NotFoundException if the user is not found or not active
   */
  async getProfileByPublicId(publicId: string): Promise<PublicProfileDto> {
    // Find the user by publicId
    const user = await this.userModel
      .findOne({ publicId })
      .select(
        'publicId customName fullName designation company bio avatarUrl phone publicEmail hiddenFields activeMode status',
      )
      .lean()
      .exec();

    // Requirement 5.3 — 404 for non-existent, suspended, or deleted users
    if (!user || user.status !== 'active') {
      throw new NotFoundException('Profile not found');
    }

    return this.buildPublicProfileDto(user);
  }

  /**
   * Get a public profile by custom name.
   * - If the name is current: return the profile.
   * - If the name is retired: return redirectTo with the canonical /c/{publicId} URL.
   * - Otherwise: throw NotFoundException.
   *
   * Requirement 6.1–6.5 — custom name resolution with redirect logic.
   *
   * @param name - The custom name (lowercased)
   * @returns Response DTO with profile or redirectTo
   * @throws NotFoundException if the name doesn't exist
   */
  async getProfileByCustomName(name: string): Promise<CustomNameResponseDto> {
    // Find the custom name claim
    const claim = await this.customNameClaimModel
      .findOne({ name: name.toLowerCase() })
      .lean()
      .exec();

    if (!claim) {
      throw new NotFoundException('Profile not found');
    }

    // Look up the user who owns this claim
    const user = await this.userModel
      .findById(claim.userId)
      .select(
        'publicId customName fullName designation company bio avatarUrl phone publicEmail hiddenFields activeMode status',
      )
      .lean()
      .exec();

    // Requirement 5.3 — 404 for suspended or deleted users (even for retired names)
    if (!user || user.status !== 'active') {
      throw new NotFoundException('Profile not found');
    }

    // If the name is retired, return a redirect
    // Requirement 6.3 — permanent redirect to /c/{publicId}
    if (claim.status === 'retired') {
      return {
        redirectTo: `/c/${user.publicId}`,
      };
    }

    // Otherwise, the name is current; return the profile
    const profile = await this.buildPublicProfileDto(user);
    return { profile };
  }

  /**
   * Build the Public Profile DTO from a user document.
   * Fetches enabled links for the active mode and filters contact fields by hiddenFields.
   *
   * @param user - The user document (lean)
   * @returns Public profile DTO
   */
  private async buildPublicProfileDto(user: any): Promise<PublicProfileDto> {
    // Fetch enabled links for the user's active mode, sorted by priorityOrder
    // Requirement 5.2 — only enabled links for the active mode
    const links = await this.linkModel
      .find({
        userId: new Types.ObjectId(user._id),
        mode: user.activeMode,
        isEnabled: true,
      })
      .sort({ priorityOrder: 1 })
      .select('_id title url icon category')
      .lean()
      .exec();

    // Map links to the public DTO format
    const publicLinks: PublicLinkDto[] = links.map((link) => ({
      id: link._id.toString(),
      title: link.title,
      url: link.url,
      icon: link.icon,
      category: link.category,
    }));

    // Filter contact fields by hiddenFields
    // Requirement 5.1 — hidden fields excluded from public page
    const contact: PublicContactDto = {};
    if (user.phone && !user.hiddenFields.includes('phone')) {
      contact.phone = user.phone;
    }
    if (user.publicEmail && !user.hiddenFields.includes('publicEmail')) {
      contact.email = user.publicEmail;
    }

    // Build the public profile DTO
    return {
      publicId: user.publicId,
      customName: user.customName,
      fullName: user.fullName,
      designation: user.designation,
      company: user.company,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      contact,
      mode: user.activeMode,
      links: publicLinks,
    };
  }
}
