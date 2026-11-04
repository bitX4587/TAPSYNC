import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>;

// ---------------------------------------------------------------------------
// AnalyticsEvent schema
//
// Records a single analytics event emitted by the public page or the API.
// Three event types are tracked (Requirement 8.1–8.3):
//   - `view`         — a Visitor loaded a profile page
//   - `link_click`   — a Visitor tapped a profile link
//   - `contact_save` — a Visitor tapped "Save Contact"
//
// Raw IP addresses are NEVER stored.  Visitor identity is approximated only
// via a salted daily `sessionHash` that cannot be reversed to an IP or
// device (Requirements 8.1, 8.9).
//
// The TTL index on `occurredAt` automatically purges records older than
// 400 days (~34 560 000 seconds), balancing retention with storage cost.
//
// Requirements: 8.1–8.9
// ---------------------------------------------------------------------------

@Schema({ timestamps: false })
export class AnalyticsEvent {
  /**
   * The Owner whose public page generated this event.
   * Not the Visitor's identity (Requirement 8.9).
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  declare userId: MongooseSchema.Types.ObjectId;

  /**
   * The type of interaction recorded.
   *   `view`         — page was loaded (Requirement 8.1)
   *   `link_click`   — a link was tapped (Requirement 8.2)
   *   `contact_save` — "Save Contact" was pressed (Requirement 8.3)
   */
  @Prop({
    type: String,
    enum: ['view', 'link_click', 'contact_save'],
    required: true,
  })
  declare type: 'view' | 'link_click' | 'contact_save';

  /**
   * The Owner's active mode at the time of the event.
   * Lets the Owner see analytics broken down by mode (Requirement 8.5).
   */
  @Prop({
    type: String,
    enum: ['work', 'casual'],
    required: true,
  })
  declare mode: 'work' | 'casual';

  /**
   * Reference to the ProfileLink that was clicked.
   * Present only for `link_click` events (Requirement 8.2).
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'ProfileLink',
    default: undefined,
  })
  linkId?: MongooseSchema.Types.ObjectId;

  /**
   * When the event occurred.
   * Used as the partition key for all range queries (Requirement 8.4) and
   * as the TTL field — documents expire 400 days after this timestamp.
   */
  @Prop({ type: Date, required: true })
  declare occurredAt: Date;

  /**
   * ISO 3166-1 alpha-2 country code derived from an edge / CDN geo header.
   * Absent when geo data is unavailable (Requirement 8.1).
   */
  @Prop({ type: String, trim: true })
  country?: string;

  /**
   * Coarse device category inferred from the User-Agent.
   * Never stores OS version or other fingerprinting data (Requirement 8.1).
   */
  @Prop({
    type: String,
    enum: ['ios', 'android', 'desktop', 'other'],
  })
  deviceType?: 'ios' | 'android' | 'desktop' | 'other';

  /**
   * Referrer URL, truncated to the origin only (no path/query) to avoid
   * leaking sensitive parameters (Requirement 8.1).
   */
  @Prop({ type: String, trim: true })
  referrer?: string;

  /**
   * Salted daily hash used for session de-duplication (Requirement 8.7).
   * Computed as HMAC(dailySalt, visitorIp + userAgent) and stored only as
   * the hash — it cannot be reversed to an IP address (Requirement 8.9).
   * Absent when the request carries no usable session signal.
   */
  @Prop({ type: String })
  sessionHash?: string;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);

// ---------------------------------------------------------------------------
// Indexes
//
// { userId: 1, occurredAt: -1 }
//   Powers the summary query (total counts over a date range) and the recent
//   events list for a given Owner (Requirements 8.4, 8.5).
//
// { userId: 1, type: 1, occurredAt: -1 }
//   Powers per-type aggregations such as per-link click counts and
//   contact-save totals (Requirements 8.4, 8.5).
//
// TTL on occurredAt (400 days = 34 560 000 seconds)
//   MongoDB automatically removes documents once they age past this window,
//   keeping storage bounded without a manual purge job.
// ---------------------------------------------------------------------------
AnalyticsEventSchema.index({ userId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ userId: 1, type: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 34_560_000 });
