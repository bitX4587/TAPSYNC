import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { SaveContactDto } from './save-contact.dto.js';

/**
 * DTO for bulk sync of offline-queued contacts.
 * Requirement 12.8: Bulk upsert of pending offline entries (max 100 per call).
 */
export class SyncContactsDto {
  /**
   * Array of pending contacts to sync.
   * Maximum 100 entries per call.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveContactDto)
  @ArrayMaxSize(100)
  declare contacts: SaveContactDto[];
}
