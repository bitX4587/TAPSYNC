import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { AppConfigService } from '../config/index.js';
import { CustomNameResponseDto, PublicProfileDto } from './dto/public-profile.dto.js';
import { PublicService } from './services/public.service.js';
import { VCardService } from './services/vcard.service.js';

// ---------------------------------------------------------------------------
// Public Controller
//
// Unauthenticated endpoints for visitors to view profiles and download vCards.
// Rate limited at the module level (see public.module.ts).
//
// Requirements: 5.1–5.3, 5.11, 6.1–6.5, 10.7
// ---------------------------------------------------------------------------

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly vcardService: VCardService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * GET /public/profiles/c/:publicId
   *
   * Returns the public profile for the given Public ID.
   * Includes only enabled links for the active mode, with hidden fields removed.
   *
   * Requirement 5.1, 5.2, 5.3 — public profile endpoint.
   *
   * @param publicId - The user's immutable public identifier
   * @returns Public profile DTO
   */
  @Get('profiles/c/:publicId')
  async getProfileByPublicId(
    @Param('publicId') publicId: string,
  ): Promise<PublicProfileDto> {
    return this.publicService.getProfileByPublicId(publicId);
  }

  /**
   * GET /public/profiles/p/:name
   *
   * Returns the public profile for the given custom name if current,
   * or a redirect instruction if retired.
   *
   * Requirement 6.1–6.5 — custom name resolution with redirect for retired names.
   *
   * @param name - The custom name (case-insensitive)
   * @returns Response DTO with profile or redirectTo
   */
  @Get('profiles/p/:name')
  async getProfileByCustomName(
    @Param('name') name: string,
  ): Promise<CustomNameResponseDto> {
    return this.publicService.getProfileByCustomName(name);
  }

  /**
   * GET /public/profiles/c/:publicId/vcard
   *
   * Generates and downloads a vCard 3.0 file for the profile.
   * Uses proper Content-Type and Content-Disposition headers.
   *
   * Requirement 6.1, 6.2, 6.4, 6.5 — vCard download with escaping.
   *
   * @param publicId - The user's immutable public identifier
   * @param res - Express response object for setting headers
   */
  @Get('profiles/c/:publicId/vcard')
  @Header('Content-Type', 'text/vcard; charset=utf-8')
  async getVCard(
    @Param('publicId') publicId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Fetch the profile (throws NotFoundException if not found)
    const profile = await this.publicService.getProfileByPublicId(publicId);

    // Build the canonical profile URL
    const profileUrl = `${this.config.nextPublicUrl}/c/${publicId}`;

    // Generate the vCard
    const vcardContent = this.vcardService.generateVCard(profile, profileUrl);

    // Generate a safe filename
    const filename = this.vcardService.getVCardFilename(profile);

    // Set Content-Disposition header for download
    // Requirement 6.4 — download headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send the vCard content
    res.send(vcardContent);
  }
}
