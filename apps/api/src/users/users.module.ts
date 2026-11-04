import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MediaModule } from '../media/media.module.js';
import { User, UserSchema } from './schemas/user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MediaModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [
    // Re-export so other modules (AuthModule, etc.) can inject the User model
    MongooseModule,
    UsersService,
  ],
})
export class UsersModule {}
