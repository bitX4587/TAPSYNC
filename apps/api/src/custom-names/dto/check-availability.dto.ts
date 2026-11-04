import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Query parameters for checking custom name availability.
 *
 * Requirements: 2.8
 */
export class CheckAvailabilityDto {
  /**
   * The custom name to check for availability.
   */
  @IsString()
  @IsNotEmpty()
  declare name: string;
}
