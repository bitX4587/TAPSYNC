import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for updating an existing link.
 * Requirement 3.3 — Owner edits a link.
 * Requirement 3.5 — Owner disables a link (isEnabled).
 */
export class UpdateLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  declare title?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  declare url?: string;

  @IsString()
  @IsOptional()
  declare category?: string;

  @IsString()
  @IsOptional()
  declare icon?: string;

  @IsBoolean()
  @IsOptional()
  declare isEnabled?: boolean;
}
