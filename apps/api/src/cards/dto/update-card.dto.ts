import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for updating card metadata (label).
 */
export class UpdateCardDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  label?: string;
}
