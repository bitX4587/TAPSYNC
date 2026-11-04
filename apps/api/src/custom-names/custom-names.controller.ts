import {
  Controller,
  Get,
  Put,
  Delete,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CustomNamesService } from './custom-names.service.js';
import { CheckAvailabilityDto } from './dto/check-availability.dto.js';
import { AvailabilityResponseDto } from './dto/availability-response.dto.js';
import { ClaimCustomNameDto } from './dto/claim-custom-name.dto.js';

/**
 * Controller for custom name endpoints.
 *
 * All endpoints require authentication via JwtAuthGuard.
 * Requirements: 2.8-2.14
 */
@Controller('user/custom-name')
@UseGuards(JwtAuthGuard)
export class CustomNamesController {
  constructor(private readonly customNamesService: CustomNamesService) {}

  /**
   * GET /user/custom-name/available?name=xxx
   *
   * Checks if a custom name is available for claiming.
   *
   * Returns an object with `available` boolean and optional `reason` string
   * explaining why the name is not available (if applicable).
   *
   * @param query - Query parameters containing the name to check.
   * @returns Availability status and optional reason.
   */
  @Get('available')
  async checkAvailability(
    @Query() query: CheckAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    return this.customNamesService.checkAvailability(query.name);
  }

  /**
   * PUT /user/custom-name
   *
   * Claim or change the current user's custom name.
   *
   * This endpoint:
   * - Validates the name format and availability
   * - Enforces the rate limit (3 changes per 30 days, Requirement 2.13)
   * - Allows re-claiming own retired names (Requirement 2.14)
   * - Uses a transaction to retire the old claim and create the new one
   * - Updates User.customName to mirror the current claim
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @param dto - Body containing the desired custom name.
   * @returns Success response with the claimed name.
   */
  @Put()
  async claimOrChangeName(
    @Req() req: Request,
    @Body() dto: ClaimCustomNameDto,
  ): Promise<{ name: string; status: string }> {
    const userId = (req.user as { userId: string }).userId;
    const claim = await this.customNamesService.claimOrChangeName(
      userId,
      dto.name,
    );
    return {
      name: claim.name,
      status: 'claimed',
    };
  }

  /**
   * DELETE /user/custom-name
   *
   * Remove the current user's custom name.
   *
   * This endpoint:
   * - Marks the current claim as retired (Requirement 2.11)
   * - Clears User.customName
   * - The retired name stays reserved and keeps redirecting to the user's profile
   *
   * @param req - Express request with authenticated user attached by JwtAuthGuard.
   * @returns Success message or 204 if no custom name exists.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeName(@Req() req: Request): Promise<void> {
    const userId = (req.user as { userId: string }).userId;
    await this.customNamesService.removeName(userId);
  }
}
