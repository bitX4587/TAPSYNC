/**
 * Unit tests for the CustomNameClaim Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly (no database
 * connection required). We instantiate documents from a locally-created
 * model and call `validateSync()` to exercise the schema constraints.
 *
 * Covers:
 *  - Default field values (claimedAt auto-populated)
 *  - Required field enforcement (name, userId, status)
 *  - name is lowercased and trimmed automatically
 *  - name minlength / maxlength constraints
 *  - status enum constraint ('current' | 'retired')
 *  - retiredAt is optional and absent by default
 *  - Compound index registration ({ userId: 1, status: 1 })
 *
 * Requirements: 2.8, 2.10, 2.12, 2.13, 2.14
 */

import mongoose from 'mongoose';
import {
  CustomNameClaim,
  CustomNameClaimSchema,
} from './custom-name-claim.schema.js';

// Create a standalone in-memory-only model (no live connection needed for
// validateSync() tests).
const CustomNameClaimModel = mongoose.model<CustomNameClaim>(
  CustomNameClaim.name + '_test',
  CustomNameClaimSchema,
);

const validUserId = new mongoose.Types.ObjectId();

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – defaults', () => {
  it('auto-populates claimedAt with the current time', () => {
    const before = new Date();
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'current',
    });
    const after = new Date();

    expect(doc.claimedAt).toBeDefined();
    expect(doc.claimedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(doc.claimedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('leaves retiredAt undefined by default', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.retiredAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – required fields', () => {
  it('passes validation when all required fields are supplied', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when name is missing', () => {
    const doc = new CustomNameClaimModel({
      userId: validUserId,
      status: 'current',
    });
    const err = doc.validateSync();
    expect(err?.errors['name']).toBeDefined();
  });

  it('fails validation when userId is missing', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      status: 'current',
    });
    const err = doc.validateSync();
    expect(err?.errors['userId']).toBeDefined();
  });

  it('fails validation when status is missing', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
    });
    const err = doc.validateSync();
    expect(err?.errors['status']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – name normalisation', () => {
  it('lowercases the name field automatically', () => {
    const doc = new CustomNameClaimModel({
      name: 'AliceBob',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.name).toBe('alicebob');
  });

  it('trims leading and trailing whitespace from name', () => {
    const doc = new CustomNameClaimModel({
      name: '  alice  ',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.name).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// Name length constraints (Requirement 2.8: 3–30 characters)
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – name length constraints', () => {
  it('rejects a name shorter than 3 characters', () => {
    const doc = new CustomNameClaimModel({
      name: 'ab',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()?.errors['name']).toBeDefined();
  });

  it('accepts a name of exactly 3 characters', () => {
    const doc = new CustomNameClaimModel({
      name: 'abc',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts a name of exactly 30 characters', () => {
    const doc = new CustomNameClaimModel({
      name: 'a'.repeat(30),
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a name longer than 30 characters', () => {
    const doc = new CustomNameClaimModel({
      name: 'a'.repeat(31),
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()?.errors['name']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Status enum constraint
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – status enum', () => {
  it('accepts status "current"', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts status "retired"', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'retired',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid status value', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'active',
    });
    expect(doc.validateSync()?.errors['status']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Optional retiredAt field
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – retiredAt field', () => {
  it('accepts a valid retiredAt date for a retired claim', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'retired',
      retiredAt: new Date('2024-01-15'),
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.retiredAt).toEqual(new Date('2024-01-15'));
  });

  it('allows retiredAt to be absent on a current claim', () => {
    const doc = new CustomNameClaimModel({
      name: 'alice',
      userId: validUserId,
      status: 'current',
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.retiredAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Index registration
// ---------------------------------------------------------------------------

describe('CustomNameClaim schema – index registration', () => {
  it('registers the compound { userId, status } index', () => {
    const indexes = CustomNameClaimSchema.indexes();
    const hasCompound = indexes.some(
      ([fields]) =>
        (fields as Record<string, unknown>)['userId'] === 1 &&
        (fields as Record<string, unknown>)['status'] === 1,
    );
    expect(hasCompound).toBe(true);
  });

  it('registers the unique { name } index', () => {
    // The unique name constraint is declared via @Prop({ unique: true }),
    // which Mongoose registers as a path-level index.
    const pathOptions = CustomNameClaimSchema.path('name') as {
      options?: { unique?: boolean };
    };
    expect(pathOptions?.options?.unique).toBe(true);
  });
});
