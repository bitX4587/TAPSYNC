import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for binding a card to the current user.
 * Requirement 7.5 — Bind card to user's account.
 */
export class BindCardDto {
  /**
   * Hardware UID read from the NTAG215 tag.
   * Will be normalized to uppercase hex without separators.
   * Example: "04:ab:cd:ef:01:23:45" → "04ABCDEF012345"
   */
  @IsString()
  @IsNotEmpty()
  declare uid: string;

  /**
   * Optional human-readable label (e.g. "Main card", "Backup").
   */
  @IsString()
  @IsOptional()
  @MaxLength(50)
  label?: string;
}
