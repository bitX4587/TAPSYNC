import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export type NfcCardDocument = HydratedDocument<NfcCard>;

// ---------------------------------------------------------------------------
// NfcCard schema
//
// Represents a physical NTAG215 NFC card that has been programmed with a
// profile URL and optionally bound to an Owner's account.
//
// A UID is the hardware-level identifier read from the tag during programming.
// It is stored in uppercase hex so comparisons are case-insensitive by
// convention (e.g. "04:AB:CD:EF:01:23:45" → "04ABCDEF012345").
//
// One Owner may bind more than one card (e.g. a primary + backup), up to a
// configurable limit. Each card maps back to a single Owner via `mappedUserId`
// (Requirement 7.11). A card whose `mappedUserId` is null has been unassigned
// and can be re-bound by any Owner (Requirement 7.10).
//
// Requirements: 7.5, 7.8, 7.9, 7.10, 7.11
// ---------------------------------------------------------------------------

@Schema({ timestamps: true })
export class NfcCard {
  /**
   * Hardware UID read from the NTAG215 tag.
   * Stored in uppercase hex without separators (e.g. "04ABCDEF012345").
   * Must be globally unique — the API rejects a bind request whose UID is
   * already mapped to a different account (Requirement 7.8).
   * The unique index is declared below via the schema-level index call.
   */
  @Prop({
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  })
  declare uid: string;

  /**
   * The Owner this card is currently bound to.
   * `null` means the card has been unassigned and is available for
   * re-binding (Requirement 7.10).
   * Indexed so the service can efficiently list all cards for a given user
   * and enforce the per-user card limit (Requirement 7.11).
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  declare mappedUserId: MongooseSchema.Types.ObjectId | null;

  /**
   * Lifecycle state of the card.
   * `active`      — bound to an Owner and in use.
   * `unassigned`  — not bound to any Owner; eligible for (re-)binding.
   *
   * Transitions:
   *   unassigned → active   on a successful bind (Requirement 7.5).
   *   active → unassigned   when the Owner deactivates or replaces the card
   *                         (Requirement 7.10).
   */
  @Prop({
    type: String,
    enum: ['active', 'unassigned'],
    required: true,
    default: 'unassigned',
  })
  declare status: 'active' | 'unassigned';

  /**
   * Optional human-readable label the Owner can assign to distinguish
   * multiple cards (e.g. "Main card", "Backup").
   */
  @Prop({ type: String, trim: true })
  label?: string;

  /**
   * Timestamp of the most recent successful NDEF write to this tag.
   * Absent until the first successful write. Updated on every re-program
   * (Requirement 7.9 — re-programming is allowed and keeps the binding).
   */
  @Prop({ type: Date })
  lastProgrammedAt?: Date;

  // ── Timestamps added by { timestamps: true } ──────────────────────────────
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const NfcCardSchema = SchemaFactory.createForClass(NfcCard);

// ---------------------------------------------------------------------------
// Indexes
//
// { uid: 1 } unique — enforces globally unique UIDs across all cards and
//   supports the O(log n) conflict check in POST /cards/bind (Req 7.8).
//
// { mappedUserId: 1 } — supports listing a user's cards (GET /cards) and
//   counting bound cards for the per-user limit check (Req 7.11).
// ---------------------------------------------------------------------------
NfcCardSchema.index({ uid: 1 }, { unique: true });
NfcCardSchema.index({ mappedUserId: 1 });
