import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AnalyticsModule } from './analytics/index.js';
import { AuthModule } from './auth/index.js';
import { CommonModule } from './common/index.js';
import { AppConfigModule, AppConfigService } from './config/index.js';
import { CustomNamesModule } from './custom-names/index.js';
import { HealthModule } from './health/health.module.js';
import { LinksModule } from './links/index.js';
import { NetworkModule } from './network/index.js';
import { PublicModule } from './public/index.js';
import { RevalidationModule } from './revalidation/index.js';
import { UsersModule } from './users/index.js';

@Module({
  imports: [
    // Config must come first so every other module can inject AppConfigService
    AppConfigModule,
    // Common infrastructure: global exception filter, rate limiting
    CommonModule,
    // Database connection
    MongooseModule.forRootAsync({
      // AppConfigModule is @Global so AppConfigService is available here
      // without listing it in inject[] explicitly via useFactory
      useFactory: (config: AppConfigService) => ({
        uri: config.mongodbUri,
      }),
      inject: [AppConfigService],
    }),
    // Health check
    HealthModule,
    // Revalidation service (calls Next.js webhook for on-demand cache invalidation)
    RevalidationModule,
    // Users (User schema, model)
    UsersModule,
    // Authentication (anonymous account creation, token issuance)
    AuthModule,
    // Custom names (custom name claims, availability check)
    CustomNamesModule,
    // Links (profile link CRUD)
    LinksModule,
    // Analytics (event ingestion, owner analytics queries)
    AnalyticsModule,
    // Network (My Network / saved contacts)
    NetworkModule,
    // Public (unauthenticated profile viewing and vCard download)
    PublicModule,
  ],
})
export class AppModule {}
