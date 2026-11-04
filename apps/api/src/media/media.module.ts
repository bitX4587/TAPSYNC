import { Module } from '@nestjs/common';

import { AppConfigModule } from '../config/config.module.js';
import { MediaService } from './media.service.js';

/**
 * Module for media upload functionality.
 *
 * Provides MediaService for avatar uploads.
 */
@Module({
  imports: [AppConfigModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
