import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for claiming or changing a custom name.
 *
 * Requirements: 2.8, 2.9, 2.10
 */
export class ClaimCustomNameDto {
  /**
   * The desired custom name.
   * - 3–30 characters
   * - Lowercase letters, numbers, underscores, hyphens
   * - Must start with a letter or number
   */
  @IsString()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(30, { message: 'Name must be no more than 30 characters long' })
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message:
      'Name must start with a letter or number and can only contain lowercase letters, numbers, underscores, and hyphens',
  })
  declare name: string;
}
