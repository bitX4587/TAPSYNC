import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HealthController } from './health.controller.js';

/**
 * HealthModule
 *
 * Exposes `GET /health` – a public, un-throttled endpoint that reports
 * application liveness and MongoDB connectivity.
 *
 * MongooseModule is imported here to make the default Mongoose connection
 * available for injection into {@link HealthController}.
 */
@Module({
  imports: [MongooseModule],
  controllers: [HealthController],
})
export class HealthModule {}
