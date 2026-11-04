import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Mode } from '@tapsync/shared';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

import { LinksService } from './links.service.js';
import { CreateLinkDto, MoveCopyLinkDto, ReorderLinksDto, UpdateLinkDto } from './dto/index.js';

/**
 * Controller for profile link management.
 * All endpoints require authentication.
 * Requirements 3.1–3.9.
 */
@Controller('links')
@UseGuards(JwtAuthGuard)
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  /**
   * GET /links?mode=work|casual
   * List all links for the authenticated user.
   * Optionally filter by mode.
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query('mode') mode?: Mode,
  ) {
    return this.linksService.findAll(userId, mode);
  }

  /**
   * GET /links/:id
   * Get a single link by ID.
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.linksService.findOne(userId, id);
  }

  /**
   * POST /links
   * Create a new link.
   * Requirement 3.1: Create link with title, URL, mode, category, icon.
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateLinkDto,
  ) {
    return this.linksService.create(userId, dto);
  }

  /**
   * PATCH /links/:id
   * Update an existing link.
   * Requirement 3.3: Edit link.
   * Requirement 3.5: Enable/disable link via isEnabled field.
   */
  @Patch(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLinkDto,
  ) {
    return this.linksService.update(userId, id, dto);
  }

  /**
   * DELETE /links/:id
   * Delete a link.
   * Requirement 3.6: Delete link.
   */
  @Delete(':id')
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    await this.linksService.delete(userId, id);
    return { success: true };
  }

  /**
   * PUT /links/reorder
   * Atomically reorder links within a mode.
   * Requirement 3.4: Persist new priorityOrder atomically.
   */
  @Put('reorder')
  async reorder(
    @CurrentUser('userId') userId: string,
    @Body() dto: ReorderLinksDto,
  ) {
    await this.linksService.reorder(userId, dto);
    return { success: true };
  }

  /**
   * POST /links/:id/move-copy
   * Move or copy a link to another mode.
   * Requirement 3.7: Move or copy link between modes.
   */
  @Post(':id/move-copy')
  async moveCopy(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: MoveCopyLinkDto,
  ) {
    return this.linksService.moveCopy(userId, id, dto);
  }
}
