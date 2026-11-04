import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection, ConnectionStates } from 'mongoose';

export interface HealthResponse {
  status: 'ok';
  db: 'connected' | 'disconnected';
}

/**
 * Public health-check endpoint.
 *
 * Returns HTTP 200 in all cases so load-balancers always get a response.
 * The `db` field lets operators distinguish a live API from one that has
 * lost its database connection without needing to inspect logs.
 *
 * Rate limiting is skipped; this endpoint is called frequently by
 * monitoring tooling and should never be throttled.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check(): HealthResponse {
    const dbConnected =
      this.connection.readyState === ConnectionStates.connected;

    return {
      status: 'ok',
      db: dbConnected ? 'connected' : 'disconnected',
    };
  }
}
