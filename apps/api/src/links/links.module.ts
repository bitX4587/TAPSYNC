import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProfileLink, ProfileLinkSchema } from './schemas/profile-link.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { LinksController } from './links.controller.js';
import { LinksService } from './links.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProfileLink.name, schema: ProfileLinkSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [LinksController],
  providers: [LinksService],
  exports: [
    // Re-export so other modules (e.g. PublicModule, AnalyticsModule) can
    // inject the ProfileLink model without re-declaring the feature.
    MongooseModule,
    LinksService,
  ],
})
export class LinksModule {}
