import { IsEnum } from 'class-validator';
import { Mode } from '@tapsync/shared';

/**
 * DTO for PATCH /user/mode
 *
 * Toggles the user's active mode between 'work' and 'casual'.
 * The mode determines which set of links is shown on the public profile page.
 *
 * Requirements: 4.1, 4.2
 * - Requirement 4.1: The system SHALL store exactly one Active Mode per Owner, defaulting to `work`.
 * - Requirement 4.2: WHEN an Owner calls the mode toggle with `work` or `casual` THEN the system SHALL update the Active Mode and return the new value.
 */
export class UpdateModeDto {
  /**
   * The mode to set. Must be either 'work' or 'casual'.
   */
  @IsEnum(Mode, {
    message: 'mode must be either work or casual',
  })
  declare mode: Mode;
}
