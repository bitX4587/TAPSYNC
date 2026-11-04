import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// ---------------------------------------------------------------------------
// Refresh token sub-document
// ---------------------------------------------------------------------------

@Schema({ _id: false })
export class RefreshTokenHash {
  @Prop({ required: true })
  declare hash: string;

  @Prop({ required: true })
  declare expiresAt: Date;

  @Prop()
  deviceId?: string;
}

export const RefreshTokenHashSchema = SchemaFactory.createForClass(RefreshTokenHash);

// ---------------------------------------------------------------------------
// User document type
// ---------------------------------------------------------------------------

export type UserDocument = HydratedDocument<User>;

// ---------------------------------------------------------------------------
// User schema
// ---------------------------------------------------------------------------

@Schema({ timestamps: true })
export class User {
  // ── Credentials (all optional; absent = anonymous account) ────────────────

  /**
   * Lowercased email address. Linked after the Owner connects an email + password.
   * Unique sparse index: only enforced when the field is present.
   */
  @Prop({
    type: String,
    lowercase: true,
    trim: true,
    sparse: true,
    unique: true,
  })
  email?: string;

  /** Whether the linked email address has been verified. */
  @Prop({ default: false })
  declare emailVerified: boolean;

  /** Argon2id hash of the Owner's password. Only present when email is linked. */
  @Prop()
  passwordHash?: string;

  /**
   * Google sub-claim. Linked after the Owner connects their Google account.
   * Unique sparse index: only enforced when the field is present.
   */
  @Prop({ type: String, sparse: true, unique: true })
  googleId?: string;

  /** Argon2id hash of the recovery code. Regenerating invalidates the previous one. */
  @Prop()
  recoveryCodeHash?: string;

  // ── Permanent identity ────────────────────────────────────────────────────

  /**
   * Immutable public identifier — the segment in `https://tapsync.app/c/{publicId}`.
   * Generated at signup with nanoid. Never editable. Unique index enforced.
   */
  @Prop({ required: true, unique: true, immutable: true })
  declare publicId: string;

  /**
   * Optional vanity name currently claimed by this Owner.
   * Mirrors the `current` CustomNameClaim document for this user.
   */
  @Prop({ type: String })
  customName?: string;

  // ── Profile fields ─────────────────────────────────────────────────────────

  /** Owner's display name. Blank until set; public page shows placeholder. */
  @Prop({ type: String })
  fullName?: string;

  /** Short bio (max 280 characters). */
  @Prop({ type: String, maxlength: 280 })
  bio?: string;

  @Prop({ type: String })
  designation?: string;

  @Prop({ type: String })
  company?: string;

  /** Phone number (shown only when not in hiddenFields). */
  @Prop({ type: String })
  phone?: string;

  /** Email address shown on the public page (distinct from the login email). */
  @Prop({ type: String })
  publicEmail?: string;

  /**
   * Fields the Owner has chosen to hide from the public page and vCard.
   * Allowed values: 'phone' | 'publicEmail'
   */
  @Prop({ type: [String], enum: ['phone', 'publicEmail'], default: [] })
  declare hiddenFields: ('phone' | 'publicEmail')[];

  /** CDN URL of the Owner's resized avatar. */
  @Prop({ type: String })
  avatarUrl?: string;

  // ── Mode and UI preferences ───────────────────────────────────────────────

  /**
   * Currently active mode. Determines which links appear on the public page.
   * Defaults to 'work' per Requirement 4.1.
   */
  @Prop({ type: String, enum: ['work', 'casual'], default: 'work' })
  declare activeMode: 'work' | 'casual';

  @Prop({ type: String, enum: ['light', 'dark', 'system'] })
  theme?: 'light' | 'dark' | 'system';

  // ── Account status ────────────────────────────────────────────────────────

  @Prop({
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  })
  declare status: 'active' | 'suspended' | 'deleted';

  // ── Refresh tokens ────────────────────────────────────────────────────────

  /**
   * Hashed rotating refresh tokens.
   * Each entry tracks one device/session. Reuse of a superseded token revokes
   * all tokens in the family (see Requirement 1.11).
   */
  @Prop({ type: [RefreshTokenHashSchema], default: [] })
  declare refreshTokenHashes: RefreshTokenHash[];

  // ── Timestamps added by { timestamps: true } ──────────────────────────────
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// ---------------------------------------------------------------------------
// Additional indexes
// ---------------------------------------------------------------------------
// publicId unique index is declared via @Prop({ unique: true }) above.
// email and googleId unique sparse indexes are declared via @Prop above.
// No additional index declarations are needed here.
