import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  CustomNameClaim,
  CustomNameClaimSchema,
} from './schemas/custom-name-claim.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { CustomNamesService } from './custom-names.service.js';
import { CustomNamesController } from './custom-names.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomNameClaim.name, schema: CustomNameClaimSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CustomNamesController],
  providers: [CustomNamesService],
  exports: [
    // Re-export so other modules (e.g. UsersModule, AuthModule) can inject
    // the CustomNameClaim model.
    MongooseModule,
    CustomNamesService,
  ],
})
export class CustomNamesModule {}
