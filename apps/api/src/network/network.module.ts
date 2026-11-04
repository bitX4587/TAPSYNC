import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { NetworkContact, NetworkContactSchema } from './schemas/network-contact.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { NetworkController } from './network.controller.js';
import { NetworkService } from './network.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NetworkContact.name, schema: NetworkContactSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NetworkController],
  providers: [NetworkService],
  exports: [
    // Re-export NetworkService so other modules (e.g. UsersModule for marking
    // contacts unavailable on profile deletion) can call it.
    NetworkService,
    MongooseModule,
  ],
})
export class NetworkModule {}
