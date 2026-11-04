import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Mode } from '@tapsync/shared';

/**
 * DTO for moving or copying a link between modes.
 * Requirement 3.7 — Owner moves or copies link between modes.
 */
export class MoveCopyLinkDto {
  @IsEnum(Mode)
  declare targetMode: Mode;

  @IsBoolean()
  @IsOptional()
  declare copy?: boolean; // If true, copy instead of move
}
