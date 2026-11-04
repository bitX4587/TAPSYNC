import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { Mode } from '@tapsync/shared';

/**
 * DTO for saving a contact to My Network.
 * Requirement 12.1: Idempotent upsert by publicId (source, tappedAt).
 * Requirement 12.2: Store snapshot and metadata.
 */
export class SaveContactDto {
  /**
   * Public ID of the profile being saved.
   * Must be a 10-character string from the allowed alphabet.
   */
  @IsString()
  @IsNotEmpty()
  @Length(10, 10)
  declare publicId: string;

  /**
   * How the contact was saved.
   * Required: 12.2
   */
  @IsEnum(['nfc', 'qr', 'link', 'scan'])
  declare source: 'nfc' | 'qr' | 'link' | 'scan';

  /**
   * Timestamp when the contact was tapped/saved.
   * ISO 8601 date string.
   */
  @IsString()
  @IsNotEmpty()
  declare tappedAt: string;

  /**
   * Owner's active mode at the moment the contact was saved.
   * Optional: may be unknown for some save methods.
   */
  @IsEnum(Mode)
  @IsOptional()
  declare modeAtSave?: Mode;
}
