import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for updating a contact's private note.
 * Requirement 12.4: PATCH /network/:id (private note).
 */
export class UpdateNoteDto {
  /**
   * Private note the owner can add/edit for this contact.
   * Optional: can be empty to clear the note.
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  declare note?: string;
}
