import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

import { NetworkService } from './network.service.js';
import { ListNetworkDto, SaveContactDto, SyncContactsDto, UpdateNoteDto } from './dto/index.js';

/**
 * Controller for My Network operations.
 * All endpoints require authentication.
 * Requirements 12.1–12.6, 12.8–12.10.
 */
@Controller('network')
@UseGuards(JwtAuthGuard)
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  /**
   * POST /network
   * Save a contact to My Network.
   * Idempotent: tapping the same profile again updates lastTappedAt and tapCount.
   *
   * Requirements:
   * - 12.1: Idempotent upsert by publicId
   * - 12.2: Store snapshot
   * - 12.3: Bump tapCount on repeat taps
   * - 12.4: Skip caller's own profile
   */
  @Post()
  async saveContact(
    @CurrentUser('userId') userId: string,
    @Body() dto: SaveContactDto,
  ) {
    return this.networkService.saveContact(userId, dto);
  }

  /**
   * POST /network/sync
   * Bulk sync of offline-queued contacts.
   * Requirement 12.8: Bulk upsert (max 100 per call)
   */
  @Post('sync')
  async syncContacts(
    @CurrentUser('userId') userId: string,
    @Body() dto: SyncContactsDto,
  ) {
    return this.networkService.syncContacts(userId, dto);
  }

  /**
   * GET /network?search=&cursor=&limit=
   * List My Network contacts with search and pagination.
   * Requirement 12.3: List with search, cursor pagination, ordered by lastTappedAt
   */
  @Get()
  async listContacts(
    @CurrentUser('userId') userId: string,
    @Query() dto: ListNetworkDto,
  ) {
    return this.networkService.listContacts(userId, dto);
  }

  /**
   * PATCH /network/:id
   * Update a contact's private note.
   * Requirement 12.4: Edit private note
   */
  @Patch(':id')
  async updateNote(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.networkService.updateNote(userId, id, dto);
  }

  /**
   * DELETE /network/:id
   * Remove a contact from My Network.
   * Requirement 12.4: Delete contact
   */
  @Delete(':id')
  async deleteContact(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    await this.networkService.deleteContact(userId, id);
    return { success: true };
  }
}
