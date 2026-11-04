import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export type NetworkContactDocument = HydratedDocument<NetworkContact>;

// ---------------------------------------------------------------------------
// Snapshot sub-document
//
// A point-in-time copy of the saved profile's display fields, stored so
// that the My Network list can render avatar, name and designation even
// when the device is offline or the profile is later unavailable.
//
// All sub-document fields are optional because the target profile may have
// no name or avatar at the time of saving (Requirement 12.2).
// ---------------------------------------------------------------------------

@Schema({ _id: false })
export class ContactSnapshot {
  @Prop({ type: String, trim: true })
  name?: string;

  @Prop({ type: String, trim: true })
  designation?: string;

  @Prop({ type: String, trim: true })
  avatarUrl?: string;
}

export const ContactSnapshotSchema = SchemaFactory.createForClass(ContactSnapshot);

// ---------------------------------------------------------------------------
// NetworkContact schema
//
// Represents one entry in a user's My Network list — a profile they saved
// by tapping a card, scanning a QR code, opening a deep link, or using the
// in-app NFC reader.
//
// Design notes:
//
// - `ownerUserId` is the user who saved the contact, NOT the profile owner.
//   The profile owner NEVER has read access to this collection (Req 12.9).
//
// - `publicId` is the public-facing identifier of the saved profile.  It is
//   stored alongside the optional `targetUserId` (resolved once online) so
//   that the contact can be shown even before the profile is resolved.
//
// - `status` is either `saved` (normal) or `unavailable` (the target profile
//   was deleted or suspended).  The `pending` state only exists inside the
//   mobile app's local SQLite store until the entry is synced via
//   POST /network/sync; it is never stored here (Requirements 12.5, 12.6).
//
// - `tapCount` starts at 1 because saving a contact IS the first tap.
//   Subsequent taps increment it without creating a duplicate entry
//   (Requirement 12.3).
//
// - `firstSavedAt` and `lastTappedAt` are stored explicitly rather than
//   relying on Mongoose timestamps so that they can be set accurately from
//   offline-queued events during sync (Requirements 12.2, 12.5).
//
// Requirements: 12.1–12.6, 12.9
// ---------------------------------------------------------------------------

@Schema({ timestamps: true })
export class NetworkContact {
  /**
   * The user whose My Network list this entry belongs to.
   * This is the person who saved (tapped / scanned) the contact,
   * NOT the person whose profile was saved.
   * The profile owner has NO read access to this collection (Req 12.9).
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  declare ownerUserId: MongooseSchema.Types.ObjectId;

  /**
   * The Public ID of the saved profile (Requirement 12.2).
   * Together with `ownerUserId` this forms the unique key for a saved
   * contact — duplicates are rejected or merged (Requirement 12.3).
   */
  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  declare publicId: string;

  /**
   * Resolved User ObjectId for the saved profile.
   * Populated once when the device is online and the profile has been
   * looked up.  Absent while the contact is still pending resolution.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: undefined,
  })
  targetUserId?: MongooseSchema.Types.ObjectId;

  /**
   * Lifecycle state of this saved contact entry:
   *   `saved`       — the profile exists and was saved normally.
   *   `unavailable` — the target profile was deleted or suspended;
   *                   the entry is kept until the owner removes it
   *                   (Requirement 12.6).
   *
   * The `pending` state exists ONLY in the mobile app's local SQLite
   * store and is NEVER persisted here (Requirement 12.5).
   */
  @Prop({
    type: String,
    enum: ['saved', 'unavailable'],
    required: true,
    default: 'saved',
  })
  declare status: 'saved' | 'unavailable';

  /**
   * Point-in-time snapshot of the saved profile's display fields.
   * Lets the My Network list render name, designation and avatar offline
   * or when the profile becomes unavailable (Requirement 12.2).
   */
  @Prop({ type: ContactSnapshotSchema, default: undefined })
  snapshot?: ContactSnapshot;

  /**
   * How the owner saved this contact (Requirement 12.2):
   *   `nfc`   — in-app NFC scan (Scan card).
   *   `qr`    — in-app QR code scan.
   *   `link`  — opened via the `tapsync://c/{publicId}` deep-link button
   *              on the public web page (Requirement 12.1).
   *   `scan`  — generic in-app manual capture.
   */
  @Prop({
    type: String,
    enum: ['nfc', 'qr', 'link', 'scan'],
    required: true,
  })
  declare source: 'nfc' | 'qr' | 'link' | 'scan';

  /**
   * The Owner's active mode at the moment the contact was saved.
   * Used to give context to the save event in the My Network detail view.
   * Absent when the mode was not determinable at save time.
   */
  @Prop({
    type: String,
    enum: ['work', 'casual'],
    default: undefined,
  })
  modeAtSave?: 'work' | 'casual';

  /**
   * A private note the owner can add or edit for this contact.
   * Never visible to the saved profile's owner (Requirement 12.9).
   */
  @Prop({ type: String, trim: true })
  note?: string;

  /**
   * How many times the owner has tapped / saved this contact.
   * Starts at 1 on the initial save; incremented on each subsequent
   * tap without creating a duplicate entry (Requirement 12.3).
   */
  @Prop({ type: Number, required: true, default: 1, min: 1 })
  declare tapCount: number;

  /**
   * Timestamp of the very first save (Requirement 12.2).
   * Set explicitly so it can be back-filled from offline-queued events
   * during a bulk sync (Requirement 12.5).
   */
  @Prop({ type: Date, required: true })
  declare firstSavedAt: Date;

  /**
   * Timestamp of the most recent tap or save for this contact.
   * Used to order the My Network list (most recently tapped at the top)
   * and updated on every repeat tap (Requirement 12.3).
   */
  @Prop({ type: Date, required: true })
  declare lastTappedAt: Date;

  // ── Timestamps added by { timestamps: true } ──────────────────────────────
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const NetworkContactSchema = SchemaFactory.createForClass(NetworkContact);

// ---------------------------------------------------------------------------
// Indexes
//
// { ownerUserId: 1, publicId: 1 } unique
//   Enforces that a user can only save a given profile once.  The service
//   upserts on this key instead of inserting, so tapping the same card
//   again updates `lastTappedAt` and increments `tapCount` without
//   creating a duplicate (Requirements 12.3, 12.9).
//
// { ownerUserId: 1, lastTappedAt: -1 }
//   Powers the GET /network list ordered by most-recently-tapped, scoped
//   to the requesting user (Requirement 12.3).  The descending direction
//   matches the default sort, so MongoDB can satisfy the query with an
//   index scan rather than an in-memory sort.
// ---------------------------------------------------------------------------
NetworkContactSchema.index({ ownerUserId: 1, publicId: 1 }, { unique: true });
NetworkContactSchema.index({ ownerUserId: 1, lastTappedAt: -1 });
