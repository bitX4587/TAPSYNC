import {
  IsString,
  IsOptional,
  MaxLength,
  IsEmail,
  IsArray,
  IsEnum,
  IsIn,
} from 'class-validator';

/**
 * DTO for PATCH /user/me
 *
 * All fields are optional. The Owner can update profile fields,
 * control which contact fields are hidden, and set their theme preference.
 *
 * Requirements: 2.4, 2.7
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  publicEmail?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['phone', 'publicEmail'], { each: true })
  hiddenFields?: ('phone' | 'publicEmail')[];

  @IsOptional()
  @IsEnum(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';
}
