import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AppConfigService } from '../config/app-config.service.js';
import { NfcCard, NfcCardDocument } from './schemas/nfc-card.schema.js';
import { BindCardDto, UpdateCardDto } from './dto/index.js';

/**
 * Service for managing NFC cards.
 * Requirements 7.3, 7.5, 7.8–7.11.
 */
@Injectable()
export class CardsService {
  /**
   * Maximum number of cards a single user can bind.
   * Per Requirement 7.3 (design allows configurable limit, default 10).
   */
  private readonly MAX_CARDS_PER_USER = 10;

  constructor(
    @InjectModel(NfcCard.name) private readonly cardModel: Model<NfcCardDocument>,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Returns the program payload URL for the given user.
   * This is always the canonical `/c/{publicId}` URL, never the custom name URL.
   * Requirement 7.5.
   *
   * @param publicId - The user's immutable public ID
   * @returns Object with the URL to write to the card
   */
  async getProgramPayload(publicId: string): Promise<{ url: string }> {
    const baseUrl = this.config.nextPublicUrl;
    const url = `${baseUrl}/c/${publicId}`;
    return { url };
  }

  /**
   * Binds a card to the authenticated user.
   * Normalizes the UID to uppercase hex without separators.
   * Rejects if the UID is already bound to a different user.
   * Rejects if the user has reached the per-user card limit.
   * Allows rebinding by the same user (updates lastProgrammedAt).
   *
   * Requirements 7.5, 7.8, 7.9, 7.11.
   *
   * @param userId - The authenticated user's ID
   * @param dto - BindCardDto with uid and optional label
   * @returns The created or updated NfcCard document
   */
  async bindCard(userId: string, dto: BindCardDto): Promise<NfcCardDocument> {
    // Normalize UID: uppercase, remove colons, spaces, hyphens
    const normalizedUid = this.normalizeUid(dto.uid);

    // Check if the card already exists
    const existingCard = await this.cardModel.findOne({ uid: normalizedUid });

    if (existingCard) {
      // If bound to a different user, reject with conflict
      if (
        existingCard.mappedUserId &&
        existingCard.mappedUserId.toString() !== userId
      ) {
        throw new ConflictException(
          'This card is already bound to another account. Please use a different card.',
        );
      }

      // If bound to the same user, update lastProgrammedAt and label
      existingCard.status = 'active';
      existingCard.mappedUserId = new Types.ObjectId(userId) as any;
      existingCard.lastProgrammedAt = new Date();
      if (dto.label !== undefined) {
        existingCard.label = dto.label;
      }
      return existingCard.save();
    }

    // Card doesn't exist — check per-user limit before creating
    const userCardCount = await this.cardModel.countDocuments({
      mappedUserId: new Types.ObjectId(userId),
      status: 'active',
    });

    if (userCardCount >= this.MAX_CARDS_PER_USER) {
      throw new ForbiddenException(
        `You have reached the maximum limit of ${this.MAX_CARDS_PER_USER} cards per account.`,
      );
    }

    // Create new card binding
    const card = new this.cardModel({
      uid: normalizedUid,
      mappedUserId: new Types.ObjectId(userId) as any,
      status: 'active',
      label: dto.label,
      lastProgrammedAt: new Date(),
    });

    return card.save();
  }

  /**
   * Lists all cards bound to the authenticated user.
   * Requirement 7.10 (list cards).
   *
   * @param userId - The authenticated user's ID
   * @returns Array of NfcCard documents
   */
  async listCards(userId: string): Promise<NfcCardDocument[]> {
    return this.cardModel
      .find({
        mappedUserId: new Types.ObjectId(userId),
        status: 'active',
      })
      .sort({ lastProgrammedAt: -1 })
      .exec();
  }

  /**
   * Unassigns (deactivates) a card, making it available for rebinding.
   * Only the card's owner can unassign it.
   * Requirement 7.10.
   *
   * @param userId - The authenticated user's ID
   * @param cardId - The card's document ID
   */
  async unassignCard(userId: string, cardId: string): Promise<void> {
    const card = await this.cardModel.findById(cardId);

    if (!card) {
      throw new NotFoundException('Card not found.');
    }

    // Ownership check
    if (!card.mappedUserId || card.mappedUserId.toString() !== userId) {
      throw new ForbiddenException('You do not own this card.');
    }

    card.status = 'unassigned';
    card.mappedUserId = null;
    await card.save();
  }

  /**
   * Updates card metadata (label).
   *
   * @param userId - The authenticated user's ID
   * @param cardId - The card's document ID
   * @param dto - UpdateCardDto with optional label
   * @returns The updated NfcCard document
   */
  async updateCard(
    userId: string,
    cardId: string,
    dto: UpdateCardDto,
  ): Promise<NfcCardDocument> {
    const card = await this.cardModel.findById(cardId);

    if (!card) {
      throw new NotFoundException('Card not found.');
    }

    // Ownership check
    if (!card.mappedUserId || card.mappedUserId.toString() !== userId) {
      throw new ForbiddenException('You do not own this card.');
    }

    if (dto.label !== undefined) {
      card.label = dto.label;
    }

    return card.save();
  }

  /**
   * Normalizes a card UID to uppercase hex without separators.
   * Requirement 7.11.
   *
   * @param uid - Raw UID string (may contain colons, spaces, hyphens)
   * @returns Normalized uppercase hex string
   * @example normalizeUid('04:ab:cd:ef') → '04ABCDEF'
   */
  private normalizeUid(uid: string): string {
    return uid.replace(/[:\s\-]/g, '').toUpperCase();
  }
}
