import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export type CustomNameClaimDocument = HydratedDocument<CustomNameClaim>;

// ---------------------------------------------------------------------------
// CustomNameClaim schema
//
// Enforces the design invariant that a custom name (lowercased) is globally
// unique across both current and retired claims. This single unique index
// means two users can never hold the same name, and no user can re-claim a
// name that was once owned by someone else.
//
// Requirements: 2.8, 2.10, 2.12, 2.13, 2.14
// ---------------------------------------------------------------------------

@Schema({ timestamps: true })
export class CustomNameClaim {
  /**
   * The claimed name in its canonical (lowercased) form.
   * Unique across ALL claims regardless of status, so retired names remain
   * reserved and cannot be claimed by a different Owner (Requirement 2.10).
   */
  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    // 3–30 chars: lowercase letters, digits, underscores and hyphens
    // (validated at the service layer; schema minlength/maxlength as defence-in-depth)
    minlength: 3,
    maxlength: 30,
  })
  declare name: string;

  /**
   * The Owner who holds (or once held) this name.
   * Indexed together with `status` so the service can efficiently look up
   * the current claim for a user and count recent changes.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  declare userId: MongooseSchema.Types.ObjectId;

  /**
   * `current`  — the name is actively claimed by `userId`.
   * `retired`  — the name was previously used and is kept reserved.
   *
   * There is at most one `current` claim per user at any time.
   * Retired names are never deleted so the redirect stays alive (Req 2.10).
   */
  @Prop({
    type: String,
    enum: ['current', 'retired'],
    required: true,
  })
  declare status: 'current' | 'retired';

  /**
   * When the name was first claimed in its current tenure.
   * Used to enforce the 3-changes-per-30-days rate limit (Requirement 2.13).
   */
  @Prop({ type: Date, required: true, default: () => new Date() })
  declare claimedAt: Date;

  /**
   * When this claim was retired. Absent while `status === 'current'`.
   */
  @Prop({ type: Date })
  retiredAt?: Date;

  // ── Timestamps added by { timestamps: true } ──────────────────────────────
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const CustomNameClaimSchema = SchemaFactory.createForClass(CustomNameClaim);

// ---------------------------------------------------------------------------
// Compound index: fast lookup of a user's current claim and the
// change-count query (Req 2.13: max 3 changes in 30 days).
// ---------------------------------------------------------------------------
CustomNameClaimSchema.index({ userId: 1, status: 1 });
