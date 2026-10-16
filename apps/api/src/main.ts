import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS – tightened per-environment in ConfigModule
  app.enableCors();

  // URI versioning (/v1/...)
  app.enableVersioning({ type: VersioningType.URI });

  // Global validation pipe: strip unknown fields, reject them if non-whitelisted
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`TapSync API listening on port ${port}`);
}

void bootstrap();
