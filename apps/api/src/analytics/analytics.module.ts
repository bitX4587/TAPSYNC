import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AnalyticsEvent, AnalyticsEventSchema } from './schemas/analytics-event.schema.js';
import { ProfileLink, ProfileLinkSchema } from '../links/schemas/profile-link.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      { name: ProfileLink.name, schema: ProfileLinkSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [
    // Re-export so other modules (e.g. PublicModule for event ingestion,
    // future AnalyticsService consumers) can inject the AnalyticsEvent
    // model without re-declaring the feature.
    MongooseModule,
    AnalyticsService,
  ],
})
export class AnalyticsModule {}
