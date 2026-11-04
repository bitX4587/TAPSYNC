import { IsOptional, IsString } from 'class-validator';

/**
 * DTO for listing My Network with search and pagination.
 * Requirement 12.3: List with search and cursor pagination, ordered by lastTappedAt.
 */
export class ListNetworkDto {
  /**
   * Search query for filtering by name or designation.
   * Optional.
   */
  @IsString()
  @IsOptional()
  declare search?: string;

  /**
   * Cursor for pagination.
   * The _id of the last item from the previous page.
   */
  @IsString()
  @IsOptional()
  declare cursor?: string;

  /**
   * Number of items per page.
   * Default: 20, max: 100
   */
  @IsOptional()
  declare limit?: string;
}
