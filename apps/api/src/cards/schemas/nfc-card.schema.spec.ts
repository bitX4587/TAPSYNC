/**
 * Unit tests for the NfcCard Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly (no database
 * connection required). We instantiate documents from a locally-created
 * model and call `validateSync()` to exercise the schema constraints.
 *
 * Covers:
 *  - Default field values (status, mappedUserId)
 *  - Required field enforcement (uid)
 *  - uid uppercase transformation
 *  - status enum constraint
 *  - Optional fields (label, lastProgrammedAt) are absent by default
 *
 * Requirements: 7.5, 7.8, 7.9, 7.10, 7.11
 */

import mongoose from 'mongoose';
import { NfcCard, NfcCardSchema } from './nfc-card.schema.js';

// Create a standalone in-memory-only model (no live connection needed for
// validateSync() tests).
const NfcCardModel = mongoose.model<NfcCard>(
  NfcCard.name + '_test',
  NfcCardSchema,
);

const VALID_UID = '04ABCDEF012345';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('NfcCard schema – defaults', () => {
  it('sets status to "unassigned"', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.status).toBe('unassigned');
  });

  it('sets mappedUserId to null', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.mappedUserId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('NfcCard schema – required fields', () => {
  it('passes validation with only uid supplied', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when uid is missing', () => {
    const doc = new NfcCardModel({});
    const err = doc.validateSync();
    expect(err?.errors['uid']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// uid transformation
// ---------------------------------------------------------------------------

describe('NfcCard schema – uid field', () => {
  it('uppercases a lowercase uid', () => {
    const doc = new NfcCardModel({ uid: '04abcdef012345' });
    expect(doc.uid).toBe('04ABCDEF012345');
  });

  it('trims whitespace from uid', () => {
    const doc = new NfcCardModel({ uid: '  04ABCDEF012345  ' });
    expect(doc.uid).toBe('04ABCDEF012345');
  });

  it('preserves an already-uppercase uid unchanged', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.uid).toBe(VALID_UID);
  });
});

// ---------------------------------------------------------------------------
// Enum constraints
// ---------------------------------------------------------------------------

describe('NfcCard schema – status enum', () => {
  it('rejects an invalid status value', () => {
    const doc = new NfcCardModel({ uid: VALID_UID, status: 'lost' });
    expect(doc.validateSync()?.errors['status']).toBeDefined();
  });

  it('accepts status "active"', () => {
    const doc = new NfcCardModel({ uid: VALID_UID, status: 'active' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts status "unassigned"', () => {
    const doc = new NfcCardModel({ uid: VALID_UID, status: 'unassigned' });
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Optional fields
// ---------------------------------------------------------------------------

describe('NfcCard schema – optional fields', () => {
  it('leaves label undefined when not supplied', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.label).toBeUndefined();
  });

  it('leaves lastProgrammedAt undefined when not supplied', () => {
    const doc = new NfcCardModel({ uid: VALID_UID });
    expect(doc.lastProgrammedAt).toBeUndefined();
  });

  it('stores label when provided', () => {
    const doc = new NfcCardModel({ uid: VALID_UID, label: 'Main card' });
    expect(doc.label).toBe('Main card');
    expect(doc.validateSync()).toBeUndefined();
  });

  it('stores lastProgrammedAt when provided', () => {
    const now = new Date();
    const doc = new NfcCardModel({ uid: VALID_UID, lastProgrammedAt: now });
    expect(doc.lastProgrammedAt).toEqual(now);
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mappedUserId
// ---------------------------------------------------------------------------

describe('NfcCard schema – mappedUserId', () => {
  it('accepts a valid ObjectId for mappedUserId', () => {
    const id = new mongoose.Types.ObjectId();
    const doc = new NfcCardModel({ uid: VALID_UID, mappedUserId: id });
    expect(doc.mappedUserId?.toString()).toBe(id.toString());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts null for mappedUserId (unassigned state)', () => {
    const doc = new NfcCardModel({ uid: VALID_UID, mappedUserId: null });
    expect(doc.mappedUserId).toBeNull();
    expect(doc.validateSync()).toBeUndefined();
  });
});
