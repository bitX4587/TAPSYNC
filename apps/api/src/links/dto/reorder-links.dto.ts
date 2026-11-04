import { IsArray, IsEnum, IsMongoId } from 'class-validator';
import { Mode } from '@tapsync/shared';

/**
 * DTO for atomic reordering of links within a mode.
 * Requirement 3.4 — Owner reorders links, persist atomically.
 */
export class ReorderLinksDto {
  @IsEnum(Mode)
  declare mode: Mode;

  @IsArray()
  @IsMongoId({ each: true })
  declare orderedIds: string[];
}
