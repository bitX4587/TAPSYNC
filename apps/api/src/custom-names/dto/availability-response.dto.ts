/**
 * Response DTO for custom name availability checks.
 *
 * Requirements: 2.8
 */
export class AvailabilityResponseDto {
  /**
   * Whether the custom name is available for claiming.
   */
  declare available: boolean;

  /**
   * Optional reason why the name is not available.
   * Only present when available is false.
   */
  reason?: string;
}
