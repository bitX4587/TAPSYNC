import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';

import { AnalyticsEvent, AnalyticsEventDocument } from './schemas/analytics-event.schema.js';
import { ProfileLink, ProfileLinkDocument } from '../links/schemas/profile-link.schema.js';
import { User, UserDocument } from '../users/schemas/user.schema.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { AnalyticsSummaryDto } from './dto/analytics-summary.dto.js';
import { LinkAnalyticsDto } from './dto/link-analytics.dto.js';
import { RecentEventDto } from './dto/recent-event.dto.js';

/**
 * Service for analytics operations.
 *
 * Handles event ingestion, bot filtering, session de-duplication,
 * and analytics queries.
 *
 * Requirements: 8.1–8.8
 */
@Injectable()
export class AnalyticsService {
  // Session de-duplication window: 30 minutes
  private readonly SESSION_DEDUP_WINDOW_MS = 30 * 60 * 1000;

  // Secret for session hash (in production, use environment variable)
  private readonly SESSION_HASH_SECRET = process.env.SESSION_HASH_SECRET || 'dev-secret-change-in-production';

  constructor(
    @InjectModel(AnalyticsEvent.name)
    private analyticsEventModel: Model<AnalyticsEventDocument>,
    @InjectModel(ProfileLink.name)
    private profileLinkModel: Model<ProfileLinkDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /**
   * Record an analytics event from the public page.
   *
   * Implements bot filtering, session de-duplication, and IP hashing.
   *
   * Requirements: 8.1–8.3, 8.6, 8.7
   *
   * @param dto - Event data from the public page.
   * @param request - Raw request object for headers and IP.
   */
  async recordEvent(dto: CreateEventDto, request: any): Promise<void> {
    // 1. Bot filtering (Requirement 8.6)
    const userAgent = request.headers['user-agent'] || '';
    if (this.isBot(userAgent)) {
      return; // Silently ignore bot requests
    }

    // 2. Resolve the user by publicId
    const user = await this.userModel
      .findOne({ publicId: dto.publicId })
      .select('_id')
      .lean()
      .exec();

    if (!user) {
      throw new BadRequestException('Invalid publicId');
    }

    const userId = user._id;

    // 3. Extract metadata
    const country = this.extractCountry(request);
    const deviceType = this.extractDeviceType(userAgent);
    const referrer = this.sanitizeReferrer(dto.referrer);

    // 4. Session de-duplication hash (Requirement 8.7)
    const visitorIp = this.extractIp(request);
    const sessionHash = this.hashSession(visitorIp, userAgent);

    // 5. Check for duplicate view within the de-duplication window
    if (dto.type === 'view') {
      const isDuplicate = await this.isDuplicateView(
        userId,
        sessionHash,
        this.SESSION_DEDUP_WINDOW_MS,
      );

      if (isDuplicate) {
        return; // Silently ignore duplicate view
      }
    }

    // 6. Create the event
    const event = new this.analyticsEventModel({
      userId,
      type: dto.type,
      mode: dto.mode,
      linkId: dto.linkId ? new Types.ObjectId(dto.linkId) : undefined,
      occurredAt: new Date(),
      country,
      deviceType,
      referrer,
      sessionHash,
    });

    await event.save();

    // 7. Increment click count on ProfileLink (Requirement 8.5 / 11.2)
    if (dto.type === 'link_click' && dto.linkId) {
      await this.profileLinkModel
        .updateOne(
          { _id: new Types.ObjectId(dto.linkId) },
          { $inc: { clickCount: 1 } },
        )
        .exec();
    }
  }

  /**
   * Get analytics summary over a date range.
   *
   * Requirement: 8.4
   *
   * @param userId - The authenticated user's ID.
   * @param startDate - Start of the range.
   * @param endDate - End of the range.
   */
  async getSummary(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AnalyticsSummaryDto> {
    const userObjectId = new Types.ObjectId(userId);

    const [views, linkClicks, contactSaves] = await Promise.all([
      this.analyticsEventModel
        .countDocuments({
          userId: userObjectId,
          type: 'view',
          occurredAt: { $gte: startDate, $lte: endDate },
        })
        .exec(),
      this.analyticsEventModel
        .countDocuments({
          userId: userObjectId,
          type: 'link_click',
          occurredAt: { $gte: startDate, $lte: endDate },
        })
        .exec(),
      this.analyticsEventModel
        .countDocuments({
          userId: userObjectId,
          type: 'contact_save',
          occurredAt: { $gte: startDate, $lte: endDate },
        })
        .exec(),
    ]);

    return {
      totalViews: views,
      totalLinkClicks: linkClicks,
      totalContactSaves: contactSaves,
      dateRange: {
        start: startDate,
        end: endDate,
      },
    };
  }

  /**
   * Get per-link click breakdown over a date range.
   *
   * Requirement: 8.5
   *
   * @param userId - The authenticated user's ID.
   * @param startDate - Start of the range.
   * @param endDate - End of the range.
   */
  async getLinkAnalytics(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<LinkAnalyticsDto[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Aggregate clicks per link
    const clickCounts = await this.analyticsEventModel.aggregate([
      {
        $match: {
          userId: userObjectId,
          type: 'link_click',
          occurredAt: { $gte: startDate, $lte: endDate },
          linkId: { $exists: true },
        },
      },
      {
        $group: {
          _id: '$linkId',
          clickCount: { $sum: 1 },
          mode: { $first: '$mode' }, // Assume mode doesn't change per link
        },
      },
      {
        $lookup: {
          from: 'profilelinks',
          localField: '_id',
          foreignField: '_id',
          as: 'link',
        },
      },
      {
        $unwind: '$link',
      },
      {
        $project: {
          linkId: { $toString: '$_id' },
          linkTitle: '$link.title',
          clickCount: 1,
          mode: '$link.mode',
        },
      },
      {
        $sort: { clickCount: -1 },
      },
    ]);

    return clickCounts.map((item) => ({
      linkId: item.linkId,
      linkTitle: item.linkTitle,
      clickCount: item.clickCount,
      mode: item.mode,
    }));
  }

  /**
   * Get recent events for the user.
   *
   * Requirement: 8.5
   *
   * @param userId - The authenticated user's ID.
   * @param limit - Maximum number of events to return.
   */
  async getRecentEvents(
    userId: string,
    limit: number = 50,
  ): Promise<RecentEventDto[]> {
    const userObjectId = new Types.ObjectId(userId);

    const events = await this.analyticsEventModel
      .find({ userId: userObjectId })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .populate<{ linkId: ProfileLinkDocument }>('linkId', 'title')
      .lean()
      .exec();

    return events.map((event) => {
      const dto: RecentEventDto = {
        type: event.type,
        mode: event.mode,
        occurredAt: event.occurredAt,
      };

      if (event.country) {
        dto.country = event.country;
      }

      if (event.deviceType) {
        dto.deviceType = event.deviceType;
      }

      if (event.type === 'link_click' && event.linkId) {
        dto.linkTitle = (event.linkId as any).title;
      }

      return dto;
    });
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Bot filtering via user-agent heuristics.
   *
   * Requirement: 8.6
   */
  private isBot(userAgent: string): boolean {
    const botPatterns = [
      /bot/i,
      /crawl/i,
      /spider/i,
      /slurp/i,
      /mediapartners/i,
      /facebookexternalhit/i,
      /ia_archiver/i,
      /curl/i,
      /wget/i,
      /python-requests/i,
      /axios/i,
      /okhttp/i,
      /headlesschrome/i,
      /phantomjs/i,
    ];

    return botPatterns.some((pattern) => pattern.test(userAgent));
  }

  /**
   * Extract country code from edge/CDN geo headers.
   *
   * Common headers: x-vercel-ip-country, cf-ipcountry, cloudfront-viewer-country.
   */
  private extractCountry(request: any): string | undefined {
    const country =
      request.headers['x-vercel-ip-country'] ||
      request.headers['cf-ipcountry'] ||
      request.headers['cloudfront-viewer-country'];

    return country && country !== 'unknown' ? country.toUpperCase() : undefined;
  }

  /**
   * Infer device type from user-agent.
   */
  private extractDeviceType(
    userAgent: string,
  ): 'ios' | 'android' | 'desktop' | 'other' {
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      return 'ios';
    }
    if (/Android/.test(userAgent)) {
      return 'android';
    }
    if (/Windows|Macintosh|Linux/.test(userAgent)) {
      return 'desktop';
    }
    return 'other';
  }

  /**
   * Sanitize referrer to origin only (no path/query).
   */
  private sanitizeReferrer(referrer?: string): string | undefined {
    if (!referrer) return undefined;

    try {
      const url = new URL(referrer);
      return url.origin;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract visitor IP from request.
   *
   * Checks common proxy headers first, falls back to socket IP.
   */
  private extractIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0].trim() ||
      request.headers['x-real-ip'] ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Hash the session for de-duplication.
   *
   * Uses HMAC-SHA256 with a daily salt to prevent IP reversibility.
   *
   * Requirement: 8.1, 8.9 (no raw IP storage)
   */
  private hashSession(ip: string, userAgent: string): string {
    const dailySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const data = `${ip}:${userAgent}:${dailySalt}`;

    return crypto
      .createHmac('sha256', this.SESSION_HASH_SECRET)
      .update(data)
      .digest('hex');
  }

  /**
   * Check if a view event is a duplicate within the de-duplication window.
   *
   * Requirement: 8.7
   */
  private async isDuplicateView(
    userId: Types.ObjectId,
    sessionHash: string,
    windowMs: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - windowMs);

    const count = await this.analyticsEventModel
      .countDocuments({
        userId,
        type: 'view',
        sessionHash,
        occurredAt: { $gte: cutoff },
      })
      .exec();

    return count > 0;
  }
}
