import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service.js';

/**
 * Service responsible for triggering on-demand revalidation of cached profile
 * pages in the Next.js public web app.
 *
 * Requirements: 2.6, 2.10, 3.3, 4.3, 9.3
 *
 * Calls the Next.js revalidation webhook at `POST /api/revalidate` with:
 * - A shared secret header for authentication
 * - The tag to revalidate: `profile:{publicId}`
 *
 * Implements retry with exponential backoff (up to 3 attempts) to handle
 * transient network failures. If all attempts fail, logs the error but does
 * not throw, ensuring the triggering operation (e.g., profile update) succeeds.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000;

  constructor(private readonly config: AppConfigService) {}

  /**
   * Trigger revalidation of the public profile page for a given user.
   *
   * This method is called after operations that affect the public page:
   * - Profile updates (name, bio, designation, etc.)
   * - Avatar changes
   * - Link creation, update, deletion, or reordering
   * - Mode toggle
   * - Custom name claim, change, or removal
   *
   * The method is fire-and-forget from the caller's perspective. Failures are
   * logged but not thrown. The page will still be updated via the fallback
   * 60-second ISR window if the webhook fails.
   *
   * @param publicId - The user's permanent public ID.
   */
  async revalidateProfile(publicId: string): Promise<void> {
    const url = `${this.config.nextPublicUrl}/api/revalidate`;
    const tag = `profile:${publicId}`;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-revalidation-secret': this.config.revalidationSecret,
          },
          body: JSON.stringify({ tag }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Revalidation webhook returned ${response.status}: ${text}`,
          );
        }

        this.logger.log(
          `Successfully revalidated profile:${publicId} (attempt ${attempt})`,
        );
        return; // Success, exit early
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (isLastAttempt) {
          // Final attempt failed, log error but do not throw
          this.logger.error(
            `Failed to revalidate profile:${publicId} after ${this.maxRetries} attempts: ${errorMessage}`,
          );
        } else {
          // Retry with exponential backoff
          const delayMs = this.baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.warn(
            `Revalidation attempt ${attempt} failed for profile:${publicId}: ${errorMessage}. Retrying in ${delayMs}ms...`,
          );
          await this.sleep(delayMs);
        }
      }
    }
  }

  /**
   * Trigger revalidation of both the canonical `/c/{publicId}` and the
   * custom name paths `/p/{customName}` and `/p/{oldCustomName}` when
   * a custom name changes.
   *
   * This is a specialized variant for custom name operations that need to
   * invalidate both the old and new vanity URLs in addition to the canonical URL.
   *
   * @param publicId - The user's permanent public ID.
   * @param customName - Optional current custom name to revalidate.
   */
  async revalidateProfileAndPaths(publicId: string, customName?: string): Promise<void> {
    // Revalidate the profile tag
    await this.revalidateProfile(publicId);
    
    // Also revalidate the custom name tag if provided
    if (customName) {
      const url = `${this.config.nextPublicUrl}/api/revalidate`;
      const tag = `custom-name:${customName.toLowerCase()}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-revalidation-secret': this.config.revalidationSecret,
          },
          body: JSON.stringify({ tag }),
        });

        if (response.ok) {
          this.logger.log(`Successfully revalidated custom-name:${customName}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to revalidate custom-name:${customName}`);
      }
    }
  }

  /**
   * Sleep for the specified duration.
   *
   * @param ms - Duration in milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
