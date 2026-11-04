import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { CustomNameClaim, CustomNameClaimSchema } from '../custom-names/schemas/custom-name-claim.schema.js';
import { ProfileLink, ProfileLinkSchema } from '../links/schemas/profile-link.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { PublicController } from './public.controller.js';
import { PublicService } from './services/public.service.js';
import { VCardService } from './services/vcard.service.js';

// ---------------------------------------------------------------------------
// Public Module
//
// Unauthenticated endpoints for visitors to view profiles and download vCards.
// Rate limited to prevent abuse (10 requests per minute per IP).
//
// Requirements: 5.1–5.3, 5.11, 6.1–6.5, 10.5, 10.7
// ---------------------------------------------------------------------------

@Module({
  imports: [
    // Schemas used by PublicService
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ProfileLink.name, schema: ProfileLinkSchema },
      { name: CustomNameClaim.name, schema: CustomNameClaimSchema },
    ]),
    // Rate limiting for public endpoints
    // Requirement 10.5 — rate limit public endpoints
    ThrottlerModule.forRoot([
      {
        name: 'public',
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per minute per IP
      },
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicService, VCardService],
  exports: [PublicService],
})
export class PublicModule {}
