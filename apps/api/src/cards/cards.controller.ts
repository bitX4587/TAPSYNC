import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

import { CardsService } from './cards.service.js';
import { BindCardDto, UpdateCardDto } from './dto/index.js';

/**
 * Controller for NFC card management.
 * All endpoints require authentication.
 * Requirements 7.3, 7.5, 7.8–7.11.
 */
@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  /**
   * GET /cards/program-payload
   * Returns the permanent profile URL to write to a card.
   * This is always the canonical `/c/{publicId}` URL, never the custom name.
   * Requirement 7.5.
   *
   * @returns { url: string }
   */
  @Get('program-payload')
  async getProgramPayload(
    @CurrentUser('publicId') publicId: string,
  ): Promise<{ url: string }> {
    return this.cardsService.getProgramPayload(publicId);
  }

  /**
   * POST /cards/bind
   * Binds a card UID to the authenticated user.
   * Normalizes the UID, checks conflicts, enforces per-user limit.
   * Requirements 7.5, 7.8, 7.9, 7.11.
   *
   * @returns 201 Created with the NfcCard document
   */
  @Post('bind')
  @HttpCode(HttpStatus.CREATED)
  async bindCard(
    @CurrentUser('userId') userId: string,
    @Body() dto: BindCardDto,
  ) {
    return this.cardsService.bindCard(userId, dto);
  }

  /**
   * GET /cards
   * Lists all active cards bound to the authenticated user.
   * Requirement 7.10.
   *
   * @returns Array of NfcCard documents
   */
  @Get()
  async listCards(@CurrentUser('userId') userId: string) {
    return this.cardsService.listCards(userId);
  }

  /**
   * PATCH /cards/:id
   * Updates card metadata (label).
   *
   * @returns Updated NfcCard document
   */
  @Patch(':id')
  async updateCard(
    @CurrentUser('userId') userId: string,
    @Param('id') cardId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.cardsService.updateCard(userId, cardId, dto);
  }

  /**
   * DELETE /cards/:id
   * Unassigns a card, making it available for rebinding.
   * Only the owner can unassign their card.
   * Requirement 7.10.
   *
   * @returns 204 No Content
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassignCard(
    @CurrentUser('userId') userId: string,
    @Param('id') cardId: string,
  ): Promise<void> {
    await this.cardsService.unassignCard(userId, cardId);
  }
}
