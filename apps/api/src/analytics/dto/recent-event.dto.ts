/**
 * Response DTO for GET /analytics/events (recent events).
 *
 * Single event record for the recent events list.
 * Requirement: 8.5
 */
export class RecentEventDto {
  declare type: 'view' | 'link_click' | 'contact_save';
  declare mode: 'work' | 'casual';
  declare occurredAt: Date;
  declare country?: string;
  declare deviceType?: 'ios' | 'android' | 'desktop' | 'other';
  declare linkTitle?: string; // Only for link_click events
}
