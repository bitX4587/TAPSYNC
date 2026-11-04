/**
 * Response DTO for GET /analytics/summary.
 *
 * Provides aggregate counts over a date range.
 * Requirement: 8.4
 */
export class AnalyticsSummaryDto {
  declare totalViews: number;
  declare totalLinkClicks: number;
  declare totalContactSaves: number;
  declare dateRange: {
    start: Date;
    end: Date;
  };
}
