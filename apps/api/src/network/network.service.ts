import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  NetworkContact,
  NetworkContactDocument,
  ContactSnapshot,
} from './schemas/network-contact.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { ListNetworkDto, SaveContactDto, SyncContactsDto, UpdateNoteDto } from './dto/index.js';

/**
 * Service for My Network operations.
 * Requirements 12.1–12.6, 12.8–12.10.
 */
@Injectable()
export class NetworkService {
  constructor(
    @InjectModel(NetworkContact.name)
    private readonly contactModel: Model<NetworkContactDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Save a contact to My Network.
   * Idempotent: tapping the same profile again updates lastTappedAt and tapCount.
   *
   * Requirements:
   * - 12.1: Idempotent upsert by publicId
   * - 12.2: Store snapshot (name, designation, avatar)
   * - 12.3: Bump tapCount and lastTappedAt on repeat taps
   * - 12.4: Skip the caller's own profile
   */
  async saveContact(
    ownerUserId: string,
    dto: SaveContactDto,
  ): Promise<NetworkContactDocument> {
    // Parse tappedAt as Date
    const tappedAt = new Date(dto.tappedAt);
    if (isNaN(tappedAt.getTime())) {
      throw new BadRequestException('Invalid tappedAt date format');
    }

    // Look up the target profile by publicId
    const targetUser = await this.userModel
      .findOne({ publicId: dto.publicId })
      .lean()
      .exec();

    if (!targetUser) {
      throw new NotFoundException('Profile not found');
    }

    // Requirement 12.4: Skip saving the user's own profile
    if (targetUser._id.toString() === ownerUserId) {
      throw new ForbiddenException('Cannot save your own profile');
    }

    // Mark as unavailable if the target profile is deleted or suspended
    const status =
      targetUser.status === 'deleted' || targetUser.status === 'suspended'
        ? 'unavailable'
        : 'saved';

    // Build snapshot from target user's profile
    const snapshot: ContactSnapshot = {};
    if (targetUser.fullName) {
      snapshot.name = targetUser.fullName;
    }
    if (targetUser.designation) {
      snapshot.designation = targetUser.designation;
    }
    if (targetUser.avatarUrl) {
      snapshot.avatarUrl = targetUser.avatarUrl;
    }

    // Upsert: if the contact already exists, update it; otherwise create new
    const existing = await this.contactModel
      .findOne({
        ownerUserId: new Types.ObjectId(ownerUserId),
        publicId: dto.publicId,
      })
      .exec();

    if (existing) {
      // Update existing contact: increment tapCount, update lastTappedAt
      existing.lastTappedAt = tappedAt;
      existing.tapCount += 1;
      
      // Update snapshot
      const updatedSnapshot: ContactSnapshot = {};
      if (snapshot.name) {
        updatedSnapshot.name = snapshot.name;
      }
      if (snapshot.designation) {
        updatedSnapshot.designation = snapshot.designation;
      }
      if (snapshot.avatarUrl) {
        updatedSnapshot.avatarUrl = snapshot.avatarUrl;
      }
      existing.snapshot = updatedSnapshot;
      existing.status = status;

      // Update modeAtSave if provided
      if (dto.modeAtSave) {
        existing.modeAtSave = dto.modeAtSave;
      }

      return existing.save();
    }

    // Create new contact
    const newContact = new this.contactModel({
      ownerUserId: new Types.ObjectId(ownerUserId),
      publicId: dto.publicId,
      targetUserId: targetUser._id,
      status,
      snapshot,
      source: dto.source,
      modeAtSave: dto.modeAtSave,
      note: undefined,
      tapCount: 1,
      firstSavedAt: tappedAt,
      lastTappedAt: tappedAt,
    });

    return newContact.save();
  }

  /**
   * Bulk sync of offline-queued contacts.
   * Requirements:
   * - 12.8: Bulk upsert of pending offline entries (max 100 per call)
   */
  async syncContacts(
    ownerUserId: string,
    dto: SyncContactsDto,
  ): Promise<{ saved: number; errors: string[] }> {
    const errors: string[] = [];
    let saved = 0;

    for (const contact of dto.contacts) {
      try {
        await this.saveContact(ownerUserId, contact);
        saved++;
      } catch (error) {
        // Collect errors but continue processing other contacts
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${contact.publicId}: ${message}`);
      }
    }

    return { saved, errors };
  }

  /**
   * List My Network contacts with search and pagination.
   * Requirements:
   * - 12.3: List with search and cursor pagination, ordered by lastTappedAt
   * - 12.9: Refresh snapshots from live profiles
   */
  async listContacts(
    ownerUserId: string,
    dto: ListNetworkDto,
  ): Promise<{ contacts: NetworkContactDocument[]; nextCursor: string | null }> {
    const limit = Math.min(parseInt(dto.limit || '20', 10), 100);
    const filter: Record<string, unknown> = {
      ownerUserId: new Types.ObjectId(ownerUserId),
    };

    // Add cursor-based pagination
    if (dto.cursor) {
      try {
        filter._id = { $lt: new Types.ObjectId(dto.cursor) };
      } catch {
        throw new BadRequestException('Invalid cursor format');
      }
    }

    // Add search filter
    if (dto.search) {
      const searchRegex = new RegExp(dto.search, 'i');
      filter.$or = [
        { 'snapshot.name': searchRegex },
        { 'snapshot.designation': searchRegex },
      ];
    }

    // Fetch contacts ordered by lastTappedAt descending
    const contacts = await this.contactModel
      .find(filter)
      .sort({ lastTappedAt: -1, _id: -1 }) // Secondary sort by _id for stable pagination
      .limit(limit + 1) // Fetch one extra to determine if there's a next page
      .exec();

    // Refresh snapshots from live profiles
    await this.refreshSnapshots(contacts.slice(0, limit));

    // Determine next cursor
    const hasMore = contacts.length > limit;
    const results = hasMore ? contacts.slice(0, limit) : contacts;
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastResult = results[results.length - 1];
      if (lastResult) {
        nextCursor = lastResult._id.toString();
      }
    }

    return { contacts: results, nextCursor };
  }

  /**
   * Update a contact's private note.
   * Requirement 12.4: PATCH /network/:id (private note)
   */
  async updateNote(
    ownerUserId: string,
    contactId: string,
    dto: UpdateNoteDto,
  ): Promise<NetworkContactDocument> {
    const updateOperation: Record<string, unknown> = {};
    
    // If note is provided and non-empty, set it; if empty string, unset it
    if (dto.note !== undefined) {
      if (dto.note.length > 0) {
        updateOperation.$set = { note: dto.note };
      } else {
        updateOperation.$unset = { note: 1 };
      }
    }

    const contact = await this.contactModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(contactId),
          ownerUserId: new Types.ObjectId(ownerUserId),
        },
        updateOperation,
        { new: true },
      )
      .exec();

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  /**
   * Delete a contact from My Network.
   * Requirement 12.4: DELETE /network/:id
   */
  async deleteContact(ownerUserId: string, contactId: string): Promise<void> {
    const result = await this.contactModel.deleteOne({
      _id: new Types.ObjectId(contactId),
      ownerUserId: new Types.ObjectId(ownerUserId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Contact not found');
    }
  }

  /**
   * Mark contacts as unavailable when a profile is deleted or suspended.
   * Requirement 12.5: Mark entries unavailable when profile deleted/suspended.
   *
   * This is called by the UsersService when an account is deleted or suspended.
   */
  async markContactsUnavailable(targetUserId: string): Promise<void> {
    await this.contactModel.updateMany(
      { targetUserId: new Types.ObjectId(targetUserId) },
      { $set: { status: 'unavailable' } },
    );
  }

  /**
   * Refresh snapshots from live profiles.
   * Requirement 12.9: Snapshots refreshed from live profiles on list.
   *
   * This fetches the current profile data for each contact and updates
   * the snapshot to show the latest name, designation and avatar.
   */
  private async refreshSnapshots(
    contacts: NetworkContactDocument[],
  ): Promise<void> {
    // Skip if no contacts
    if (contacts.length === 0) {
      return;
    }

    // Get all target user IDs
    const targetUserIds: Types.ObjectId[] = [];
    for (const contact of contacts) {
      if (contact.targetUserId) {
        targetUserIds.push(new Types.ObjectId(contact.targetUserId.toString()));
      }
    }

    if (targetUserIds.length === 0) {
      return;
    }

    // Fetch all target users in one query
    const targetUsers = await this.userModel
      .find({
        _id: { $in: targetUserIds },
      })
      .select('_id fullName designation avatarUrl status')
      .lean()
      .exec();

    // Create a map for quick lookup
    const userMap = new Map(
      targetUsers.map((u) => [u._id.toString(), u]),
    );

    // Update snapshots
    const bulkOps = [];
    for (const contact of contacts) {
      if (!contact.targetUserId) {
        continue;
      }

      const user = userMap.get(contact.targetUserId.toString());
      if (!user) {
        continue;
      }

      // Check if profile became unavailable
      const newStatus =
        user.status === 'deleted' || user.status === 'suspended'
          ? 'unavailable'
          : 'saved';

      const newSnapshot: ContactSnapshot = {};
      if (user.fullName) {
        newSnapshot.name = user.fullName;
      }
      if (user.designation) {
        newSnapshot.designation = user.designation;
      }
      if (user.avatarUrl) {
        newSnapshot.avatarUrl = user.avatarUrl;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: contact._id },
          update: {
            $set: {
              snapshot: newSnapshot,
              status: newStatus as 'saved' | 'unavailable',
            },
          },
        },
      });
    }

    if (bulkOps.length > 0) {
      await this.contactModel.bulkWrite(bulkOps);
    }
  }
}
