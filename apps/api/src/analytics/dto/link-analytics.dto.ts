/**
 * Response DTO for GET /analytics/links.
 *
 * Per-link click breakdown over a date range.
 * Requirement: 8.5
 */
export class LinkAnalyticsDto {
  declare linkId: string;
  declare linkTitle: string;
  declare clickCount: number;
  declare mode: 'work' | 'casual';
}
