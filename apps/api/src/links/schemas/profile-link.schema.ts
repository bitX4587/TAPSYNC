import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export type ProfileLinkDocument = HydratedDocument<ProfileLink>;

// ---------------------------------------------------------------------------
// ProfileLink schema
//
// Stores a single link owned by a User for either the Work or Casual mode.
// Links are sorted by `priorityOrder` within each (userId, mode) partition,
// and the compound index on those three fields supports both sorted listing
// and atomic reordering.
//
// Requirements: 3.1–3.9
// ---------------------------------------------------------------------------

@Schema({ timestamps: true })
export class ProfileLink {
  /**
   * The User who owns this link.
   * Indexed as part of the compound `{ userId, mode, priorityOrder }` index.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  declare userId: MongooseSchema.Types.ObjectId;

  /**
   * Which mode this link belongs to.
   * Determines whether the link appears on the Work or Casual public page.
   * Requirement 3.1 — every link is created with an explicit mode.
   */
  @Prop({
    type: String,
    enum: ['work', 'casual'],
    required: true,
  })
  declare mode: 'work' | 'casual';

  /**
   * Human-readable label shown on the public page and in the Owner's app.
   * Requirement 3.1.
   */
  @Prop({ type: String, required: true, trim: true })
  declare title: string;

  /**
   * Target URL for the link.
   * Must use `https`, `http`, `mailto` or `tel` schemes (validated at the
   * service layer; Requirement 3.2).
   */
  @Prop({ type: String, required: true, trim: true })
  declare url: string;

  /**
   * Key from the icon registry shipped in `packages/shared`, or `'custom'`
   * for a generic icon. Requirement 3.8.
   */
  @Prop({ type: String, required: true, default: 'custom' })
  declare icon: string;

  /**
   * Category name from the predefined list or `'custom'`.
   * Supported values: 'linkedin' | 'github' | 'portfolio' | 'email' |
   * 'calendar' | 'company' | 'instagram' | 'facebook' | 'twitter' |
   * 'gaming' | 'messaging' | 'spotify' | 'custom'
   * Requirement 3.8.
   */
  @Prop({ type: String, required: true, default: 'custom' })
  declare category: string;

  /**
   * Relative sort position within the (userId, mode) partition.
   * Lower numbers appear first. Updated atomically during reorder
   * (Requirement 3.4).
   */
  @Prop({ type: Number, required: true })
  declare priorityOrder: number;

  /**
   * Whether the link is visible on the public page.
   * Disabled links are kept in the database but excluded from the public DTO
   * (Requirement 3.5).
   */
  @Prop({ type: Boolean, required: true, default: true })
  declare isEnabled: boolean;

  /**
   * Denormalized click counter incremented on every click event.
   * Avoids an aggregation query for the per-link analytics view
   * (Requirement 8.2 / 11.2).
   */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  declare clickCount: number;

  // ── Timestamps added by { timestamps: true } ──────────────────────────────
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ProfileLinkSchema = SchemaFactory.createForClass(ProfileLink);

// ---------------------------------------------------------------------------
// Compound index: powers sorted link listing and atomic reorder queries.
// Requirement 3.1 (store with next priorityOrder), 3.4 (persist new order).
// ---------------------------------------------------------------------------
ProfileLinkSchema.index({ userId: 1, mode: 1, priorityOrder: 1 });
