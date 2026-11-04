import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Mode } from '@tapsync/shared';

/**
 * DTO for creating a new link.
 * Requirement 3.1 — Owner creates a link with title, URL, mode.
 */
export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare title: string;

  @IsString()
  @IsNotEmpty()
  declare url: string;

  @IsEnum(Mode)
  declare mode: Mode;

  @IsString()
  @IsNotEmpty()
  declare category: string;

  @IsString()
  @IsOptional()
  declare icon?: string;
}
