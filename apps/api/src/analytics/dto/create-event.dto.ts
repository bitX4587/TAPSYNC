import { IsEnum, IsOptional, IsString, IsMongoId } from 'class-validator';

/**
 * Request body for POST /public/events.
 *
 * Records a single analytics event from the public page.
 * Requirements: 8.1–8.3
 */
export class CreateEventDto {
  /**
   * Public ID of the Owner whose page generated this event.
   */
  @IsString()
  declare publicId: string;

  /**
   * The type of event.
   */
  @IsEnum(['view', 'link_click', 'contact_save'])
  declare type: 'view' | 'link_click' | 'contact_save';

  /**
   * The Owner's active mode at the time of the event.
   */
  @IsEnum(['work', 'casual'])
  declare mode: 'work' | 'casual';

  /**
   * Link ID for link_click events.
   */
  @IsOptional()
  @IsMongoId()
  linkId?: string;

  /**
   * Referrer URL (origin only, no path/query).
   */
  @IsOptional()
  @IsString()
  referrer?: string;
}
