/**
 * Unit tests for the User Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly (no database
 * connection required). We instantiate documents from a locally-created
 * model and call `validateSync()` to exercise the schema constraints.
 *
 * Covers:
 *  - Default field values (Requirements 4.1, 1.1, 2.1)
 *  - Required field enforcement (publicId)
 *  - hiddenFields enum constraint
 *  - bio max-length constraint
 *  - activeMode and status enum values
 *  - theme enum values
 *  - Optional credentials and profile fields are absent by default
 *  - email is lowercased automatically
 *  - refreshTokenHashes defaults to an empty array
 */

import mongoose from 'mongoose';
import { User, UserSchema } from './user.schema.js';

// Create a standalone in-memory-only model (no live connection needed for
// validateSync() tests).
const UserModel = mongoose.model<User>(User.name + '_test', UserSchema);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('User schema – defaults', () => {
  it('sets activeMode to "work"', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.activeMode).toBe('work');
  });

  it('sets status to "active"', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.status).toBe('active');
  });

  it('sets emailVerified to false', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.emailVerified).toBe(false);
  });

  it('sets hiddenFields to []', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.hiddenFields).toEqual([]);
  });

  it('sets refreshTokenHashes to []', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.refreshTokenHashes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('User schema – required fields', () => {
  it('passes validation with only publicId supplied', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when publicId is missing', () => {
    const doc = new UserModel({});
    const err = doc.validateSync();
    expect(err?.errors['publicId']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Enum constraints
// ---------------------------------------------------------------------------

describe('User schema – enum constraints', () => {
  it('rejects an invalid activeMode value', () => {
    const doc = new UserModel({ publicId: 'abc1234567', activeMode: 'party' });
    expect(doc.validateSync()?.errors['activeMode']).toBeDefined();
  });

  it('accepts activeMode "casual"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', activeMode: 'casual' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid status value', () => {
    const doc = new UserModel({ publicId: 'abc1234567', status: 'banned' });
    expect(doc.validateSync()?.errors['status']).toBeDefined();
  });

  it('accepts status "suspended"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', status: 'suspended' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts status "deleted"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', status: 'deleted' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid theme value', () => {
    const doc = new UserModel({ publicId: 'abc1234567', theme: 'matrix' });
    expect(doc.validateSync()?.errors['theme']).toBeDefined();
  });

  it('accepts theme "light"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', theme: 'light' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts theme "dark"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', theme: 'dark' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts theme "system"', () => {
    const doc = new UserModel({ publicId: 'abc1234567', theme: 'system' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a hiddenFields entry outside the allowed enum', () => {
    const doc = new UserModel({
      publicId: 'abc1234567',
      hiddenFields: ['phone', 'birthday'],
    });
    expect(doc.validateSync()?.errors['hiddenFields.1']).toBeDefined();
  });

  it('accepts valid hiddenFields values', () => {
    const doc = new UserModel({
      publicId: 'abc1234567',
      hiddenFields: ['phone', 'publicEmail'],
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Field-level constraints
// ---------------------------------------------------------------------------

describe('User schema – field-level constraints', () => {
  it('rejects a bio longer than 280 characters', () => {
    const doc = new UserModel({ publicId: 'abc1234567', bio: 'a'.repeat(281) });
    expect(doc.validateSync()?.errors['bio']).toBeDefined();
  });

  it('accepts a bio of exactly 280 characters', () => {
    const doc = new UserModel({ publicId: 'abc1234567', bio: 'a'.repeat(280) });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('lowercases the email field', () => {
    const doc = new UserModel({ publicId: 'abc1234567', email: 'User@Example.COM' });
    expect(doc.email).toBe('user@example.com');
  });
});

// ---------------------------------------------------------------------------
// Optional fields absent by default
// ---------------------------------------------------------------------------

describe('User schema – optional fields', () => {
  it('leaves credential fields undefined when not supplied', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.email).toBeUndefined();
    expect(doc.passwordHash).toBeUndefined();
    expect(doc.googleId).toBeUndefined();
    expect(doc.recoveryCodeHash).toBeUndefined();
  });

  it('leaves profile fields undefined when not supplied', () => {
    const doc = new UserModel({ publicId: 'abc1234567' });
    expect(doc.fullName).toBeUndefined();
    expect(doc.bio).toBeUndefined();
    expect(doc.designation).toBeUndefined();
    expect(doc.company).toBeUndefined();
    expect(doc.phone).toBeUndefined();
    expect(doc.publicEmail).toBeUndefined();
    expect(doc.avatarUrl).toBeUndefined();
    expect(doc.customName).toBeUndefined();
    expect(doc.theme).toBeUndefined();
  });
});
