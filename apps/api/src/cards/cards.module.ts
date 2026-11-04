import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AppConfigModule } from '../config/config.module.js';
import { NfcCard, NfcCardSchema } from './schemas/nfc-card.schema.js';
import { CardsService } from './cards.service.js';
import { CardsController } from './cards.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NfcCard.name, schema: NfcCardSchema },
    ]),
    AppConfigModule,
  ],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [
    // Re-export so other modules (e.g. AuthModule when checking untouched
    // accounts on restore, PublicModule) can inject the NfcCard model
    // without re-declaring the feature.
    MongooseModule,
    CardsService,
  ],
})
export class CardsModule {}
