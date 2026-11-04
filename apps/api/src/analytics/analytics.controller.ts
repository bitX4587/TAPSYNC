import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AnalyticsService } from './analytics.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto.js';
import { LinkAnalyticsDto } from './dto/link-analytics.dto.js';
import { RecentEventDto } from './dto/recent-event.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

/**
 * Analytics controller.
 *
 * Public event ingestion is unauthenticated and rate-limited.
 * Owner analytics queries require authentication.
 *
 * Requirements: 8.1–8.8
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Record an analytics event from the public page.
   *
   * Unauthenticated, rate-limited endpoint.
   * Bot filtering and session de-duplication happen at the service layer.
   *
   * Requirements: 8.1–8.3, 8.6, 8.7, 8.8
   *
   * @returns 204 No Content
   */
  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 100 } })
  async recordEvent(
    @Body() dto: CreateEventDto,
    @Req() request: any,
  ): Promise<void> {
    await this.analyticsService.recordEvent(dto, request);
  }

  /**
   * Get analytics summary for the authenticated user over a date range.
   *
   * Query params:
   * - range: '7d' | '30d' | 'all' (default: '30d')
   *
   * Requirements: 8.4
   *
   * @returns Analytics summary
   */
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @CurrentUser('userId') userId: string,
    @Query('range') range: string = '30d',
  ): Promise<AnalyticsSummaryDto> {
    const { startDate, endDate } = this.parseDateRange(range);
    return this.analyticsService.getSummary(userId, startDate, endDate);
  }

  /**
   * Get per-link analytics for the authenticated user over a date range.
   *
   * Query params:
   * - range: '7d' | '30d' | 'all' (default: '30d')
   *
   * Requirements: 8.5
   *
   * @returns Per-link click breakdown
   */
  @Get('links')
  @UseGuards(JwtAuthGuard)
  async getLinkAnalytics(
    @CurrentUser('userId') userId: string,
    @Query('range') range: string = '30d',
  ): Promise<LinkAnalyticsDto[]> {
    const { startDate, endDate } = this.parseDateRange(range);
    return this.analyticsService.getLinkAnalytics(userId, startDate, endDate);
  }

  /**
   * Get recent events for the authenticated user.
   *
   * Query params:
   * - limit: number (default: 50, max: 100)
   *
   * Requirements: 8.5
   *
   * @returns Recent events list
   */
  @Get('events')
  @UseGuards(JwtAuthGuard)
  async getRecentEvents(
    @CurrentUser('userId') userId: string,
    @Query('limit') limitStr?: string,
  ): Promise<RecentEventDto[]> {
    const limit = Math.min(parseInt(limitStr || '50', 10), 100);
    return this.analyticsService.getRecentEvents(userId, limit);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Parse date range query parameter.
   *
   * Supported values:
   * - '7d': last 7 days
   * - '30d': last 30 days
   * - 'all': all time
   */
  private parseDateRange(range: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let startDate: Date;

    switch (range) {
      case '7d':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'all':
        startDate = new Date(0); // Unix epoch
        break;
      default:
        throw new BadRequestException(
          'Invalid range parameter. Use "7d", "30d", or "all".',
        );
    }

    return { startDate, endDate };
  }
}
