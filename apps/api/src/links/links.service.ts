import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALLOWED_LINK_SCHEMES,
  LINK_CATEGORIES,
  MAX_LINKS_PER_MODE,
  Mode,
} from '@tapsync/shared';

import { ProfileLink, ProfileLinkDocument } from './schemas/profile-link.schema.js';
import { CreateLinkDto, MoveCopyLinkDto, ReorderLinksDto, UpdateLinkDto } from './dto/index.js';
import { RevalidationService } from '../revalidation/revalidation.service.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';

/**
 * Service for managing profile links.
 * Requirements 3.1–3.9: CRUD, reorder, enable/disable, move/copy, limits.
 */
@Injectable()
export class LinksService {
  constructor(
    @InjectModel(ProfileLink.name)
    private readonly linkModel: Model<ProfileLinkDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly revalidationService: RevalidationService,
  ) {}

  /**
   * List all links for a user in a specific mode.
   * Sorted by priorityOrder ascending.
   */
  async findAll(userId: string, mode?: Mode): Promise<ProfileLinkDocument[]> {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (mode) {
      filter.mode = mode;
    }

    return this.linkModel
      .find(filter)
      .sort({ mode: 1, priorityOrder: 1 })
      .exec();
  }

  /**
   * Get a single link by ID.
   * Throws NotFoundException if not found.
   */
  async findOne(userId: string, linkId: string): Promise<ProfileLinkDocument> {
    const link = await this.linkModel.findOne({
      _id: new Types.ObjectId(linkId),
      userId: new Types.ObjectId(userId),
    }).exec();

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    return link;
  }

  /**
   * Create a new link.
   * Requirements:
   * - 3.1: Store with title, URL, mode, category, icon, next priorityOrder
   * - 3.2: Reject URLs that don't use allowed schemes
   * - 3.9: Enforce per-mode limit of 30 links
   * - 3.3: Invalidate cache after creation
   */
  async create(userId: string, dto: CreateLinkDto): Promise<ProfileLinkDocument> {
    // Validate URL scheme (Requirement 3.2)
    this.validateUrlScheme(dto.url);

    // Validate category
    const validCategories = LINK_CATEGORIES.map((c) => c.category);
    
    if (!validCategories.includes(dto.category as never)) {
      throw new BadRequestException(
        `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      );
    }

    // Check per-mode limit (Requirement 3.9)
    const count = await this.linkModel.countDocuments({
      userId: new Types.ObjectId(userId),
      mode: dto.mode,
    });

    if (count >= MAX_LINKS_PER_MODE) {
      throw new ForbiddenException(
        `Maximum of ${MAX_LINKS_PER_MODE} links per mode exceeded`,
      );
    }

    // Get next priorityOrder
    const lastLink = await this.linkModel
      .findOne({
        userId: new Types.ObjectId(userId),
        mode: dto.mode,
      })
      .sort({ priorityOrder: -1 })
      .exec();

    const priorityOrder = lastLink ? lastLink.priorityOrder + 1 : 0;

    // Determine icon from category if not provided
    const icon = dto.icon || this.getDefaultIcon(dto.category);

    const link = new this.linkModel({
      userId: new Types.ObjectId(userId),
      title: dto.title,
      url: dto.url,
      mode: dto.mode,
      category: dto.category,
      icon,
      priorityOrder,
      isEnabled: true,
      clickCount: 0,
    });

    const savedLink = await link.save();

    // Trigger revalidation of the public profile page (Requirements: 3.3)
    const publicId = await this.getPublicId(userId);
    await this.revalidationService.revalidateProfile(publicId);

    return savedLink;
  }

  /**
   * Update an existing link.
   * Requirement 3.3: Owner edits a link, invalidate cache.
   * Requirement 3.5: Owner disables a link (isEnabled field).
   */
  async update(
    userId: string,
    linkId: string,
    dto: UpdateLinkDto,
  ): Promise<ProfileLinkDocument> {
    const link = await this.findOne(userId, linkId);

    // Validate URL scheme if URL is being changed
    if (dto.url) {
      this.validateUrlScheme(dto.url);
      link.url = dto.url;
    }

    if (dto.title !== undefined) {
      link.title = dto.title;
    }

    if (dto.category !== undefined) {
      const validCategories = LINK_CATEGORIES.map((c) => c.category);
      
      if (!validCategories.includes(dto.category as never)) {
        throw new BadRequestException(
          `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        );
      }
      link.category = dto.category;
    }

    if (dto.icon !== undefined) {
      link.icon = dto.icon;
    }

    if (dto.isEnabled !== undefined) {
      link.isEnabled = dto.isEnabled;
    }

    const updatedLink = await link.save();

    // Trigger revalidation of the public profile page (Requirements: 3.3)
    const publicId = await this.getPublicId(userId);
    await this.revalidationService.revalidateProfile(publicId);

    return updatedLink;
  }

  /**
   * Delete a link.
   * Requirement 3.6: Owner deletes a link.
   * Requirement 3.3: Invalidate cache after deletion.
   */
  async delete(userId: string, linkId: string): Promise<void> {
    const result = await this.linkModel.deleteOne({
      _id: new Types.ObjectId(linkId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Link not found');
    }

    // Trigger revalidation of the public profile page (Requirements: 3.3)
    const publicId = await this.getPublicId(userId);
    await this.revalidationService.revalidateProfile(publicId);
  }

  /**
   * Atomically reorder links within a mode.
   * Requirement 3.4: Persist new priorityOrder values atomically.
   * Requirement 3.3: Invalidate cache after reordering.
   */
  async reorder(userId: string, dto: ReorderLinksDto): Promise<void> {
    const { mode, orderedIds } = dto;

    // Fetch all links for this mode to verify ownership
    const links = await this.linkModel
      .find({
        userId: new Types.ObjectId(userId),
        mode,
      })
      .exec();

    // Verify all IDs belong to this user and mode
    const linkIds = links.map((l) => l._id.toString());
    const providedIds = orderedIds;

    if (providedIds.length !== linkIds.length) {
      throw new BadRequestException(
        'Ordered IDs count does not match existing links count',
      );
    }

    for (const id of providedIds) {
      if (!linkIds.includes(id)) {
        throw new BadRequestException(`Link ID ${id} not found or not owned by user`);
      }
    }

    // Update priorityOrder for each link using bulkWrite for atomicity
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(id),
          userId: new Types.ObjectId(userId),
          mode,
        },
        update: { $set: { priorityOrder: index } },
      },
    }));

    await this.linkModel.bulkWrite(bulkOps);

    // Trigger revalidation of the public profile page (Requirements: 3.3)
    const publicId = await this.getPublicId(userId);
    await this.revalidationService.revalidateProfile(publicId);
  }

  /**
   * Move or copy a link between modes.
   * Requirement 3.7: Owner moves or copies link between modes.
   */
  async moveCopy(
    userId: string,
    linkId: string,
    dto: MoveCopyLinkDto,
  ): Promise<ProfileLinkDocument> {
    const sourceLink = await this.findOne(userId, linkId);

    // If target mode is the same, nothing to do
    if (sourceLink.mode === dto.targetMode) {
      throw new BadRequestException('Link is already in the target mode');
    }

    // Check per-mode limit for target mode
    const targetCount = await this.linkModel.countDocuments({
      userId: new Types.ObjectId(userId),
      mode: dto.targetMode,
    });

    if (targetCount >= MAX_LINKS_PER_MODE) {
      throw new ForbiddenException(
        `Maximum of ${MAX_LINKS_PER_MODE} links per mode exceeded in target mode`,
      );
    }

    // Get next priorityOrder for target mode
    const lastLink = await this.linkModel
      .findOne({
        userId: new Types.ObjectId(userId),
        mode: dto.targetMode,
      })
      .sort({ priorityOrder: -1 })
      .exec();

    const priorityOrder = lastLink ? lastLink.priorityOrder + 1 : 0;

    if (dto.copy) {
      // Copy: create new link in target mode
      const newLink = new this.linkModel({
        userId: sourceLink.userId,
        title: sourceLink.title,
        url: sourceLink.url,
        mode: dto.targetMode,
        category: sourceLink.category,
        icon: sourceLink.icon,
        priorityOrder,
        isEnabled: sourceLink.isEnabled,
        clickCount: 0,
      });

      return newLink.save();
    } else {
      // Move: update mode and priorityOrder
      sourceLink.mode = dto.targetMode;
      sourceLink.priorityOrder = priorityOrder;
      return sourceLink.save();
    }
  }

  /**
   * Increment click count for a link.
   * Used by analytics service.
   */
  async incrementClickCount(linkId: string): Promise<void> {
    await this.linkModel.updateOne(
      { _id: new Types.ObjectId(linkId) },
      { $inc: { clickCount: 1 } },
    );
  }

  /**
   * Validate that a URL uses an allowed scheme.
   * Requirement 3.2: Reject URLs with disallowed schemes.
   */
  private validateUrlScheme(url: string): void {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }

    if (!ALLOWED_LINK_SCHEMES.includes(parsedUrl.protocol as never)) {
      throw new BadRequestException(
        `URL scheme must be one of: ${ALLOWED_LINK_SCHEMES.map((s) => s.replace(':', '')).join(', ')}`,
      );
    }
  }

  /**
   * Get default icon for a category from the registry.
   */
  private getDefaultIcon(category: string): string {
    const meta = LINK_CATEGORIES.find((c) => c.category === category);
    return meta?.defaultIcon || 'link';
  }

  /**
   * Get the publicId for a user.
   * Helper method used to trigger revalidation after link operations.
   */
  private async getPublicId(userId: string): Promise<string> {
    const user = await this.userModel
      .findById(userId)
      .select('publicId')
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.publicId;
  }
}
