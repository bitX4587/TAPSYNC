import './instrument.js';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppConfigService } from './config/index.js';
import { AppModule } from './app.module.js';
import { JsonLoggerService } from './common/logger/json-logger.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Structured logging ────────────────────────────────────────────────────
  app.useLogger(new JsonLoggerService());

  // Typed config – read after the DI container is ready
  const config = app.get(AppConfigService);

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS – restricted to allowed origins from config ─────────────────────
  // In development CORS_ORIGIN defaults to the Next.js dev server.
  // Set CORS_ORIGIN=https://tapsync.app,https://www.tapsync.app in production.
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── URI versioning (/v1/...) ──────────────────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI });

  // ── Global validation pipe ────────────────────────────────────────────────
  // Strip unknown fields, reject them, and auto-transform primitives.
  // The global exception filter (registered via APP_FILTER in CommonModule)
  // formats the resulting 400 into { statusCode, code, message, details }.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.port;
  await app.listen(port);
  console.log(`TapSync API listening on port ${port}`);
}

void bootstrap();
