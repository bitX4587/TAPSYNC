import { Global, Module } from '@nestjs/common';

import { RevalidationService } from './revalidation.service.js';

/**
 * Global module providing the RevalidationService to all modules.
 *
 * This module is marked as @Global() so it can be imported once in AppModule
 * and the RevalidationService can be injected anywhere without re-importing
 * this module.
 *
 * The RevalidationService is used by:
 * - UsersModule (profile updates, avatar changes, mode toggle)
 * - LinksModule (link CRUD operations)
 * - CustomNamesModule (custom name claim, change, removal)
 */
@Global()
@Module({
  providers: [RevalidationService],
  exports: [RevalidationService],
})
export class RevalidationModule {}
