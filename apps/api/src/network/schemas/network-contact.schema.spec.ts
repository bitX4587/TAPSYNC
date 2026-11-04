/**
 * Unit tests for the NetworkContact Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly (no database
 * connection required). We instantiate documents from a locally-created
 * model and call `validateSync()` to exercise schema constraints.
 *
 * Covers:
 *  - Default field values (status, tapCount)                   (Requirements 12.2, 12.3)
 *  - Required field enforcement (ownerUserId, publicId,
 *    source, firstSavedAt, lastTappedAt)                       (Requirement 12.2)
 *  - status enum constraint ('saved' | 'unavailable')           (Requirement 12.6)
 *  - source enum constraint ('nfc' | 'qr' | 'link' | 'scan')   (Requirement 12.2)
 *  - modeAtSave enum constraint ('work' | 'casual')            (Requirement 12.2)
 *  - tapCount minimum value of 1                               (Requirement 12.3)
 *  - Optional fields are absent by default                     (Requirement 12.2)
 *  - snapshot sub-document shape                               (Requirement 12.2)
 */

import mongoose, { Types } from 'mongoose';
import { NetworkContact, NetworkContactSchema } from './network-contact.schema.js';

// Create a standalone in-memory-only model (no live connection needed for
// validateSync() tests).
const NetworkContactModel = mongoose.model<NetworkContact>(
  NetworkContact.name + '_test',
  NetworkContactSchema,
);

// Minimal valid document shape used as a base across tests.
const ownerId = new Types.ObjectId();
const baseDoc = () => ({
  ownerUserId: ownerId,
  publicId: 'abc1234567',
  source: 'link' as const,
  firstSavedAt: new Date(),
  lastTappedAt: new Date(),
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('NetworkContact schema – defaults', () => {
  it('sets status to "saved"', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.status).toBe('saved');
  });

  it('sets tapCount to 1', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.tapCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('NetworkContact schema – required fields', () => {
  it('passes validation with all required fields supplied', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when ownerUserId is missing', () => {
    const { ownerUserId: _omit, ...rest } = baseDoc();
    const doc = new NetworkContactModel(rest);
    expect(doc.validateSync()?.errors['ownerUserId']).toBeDefined();
  });

  it('fails validation when publicId is missing', () => {
    const { publicId: _omit, ...rest } = baseDoc();
    const doc = new NetworkContactModel(rest);
    expect(doc.validateSync()?.errors['publicId']).toBeDefined();
  });

  it('fails validation when source is missing', () => {
    const { source: _omit, ...rest } = baseDoc();
    const doc = new NetworkContactModel(rest);
    expect(doc.validateSync()?.errors['source']).toBeDefined();
  });

  it('fails validation when firstSavedAt is missing', () => {
    const { firstSavedAt: _omit, ...rest } = baseDoc();
    const doc = new NetworkContactModel(rest);
    expect(doc.validateSync()?.errors['firstSavedAt']).toBeDefined();
  });

  it('fails validation when lastTappedAt is missing', () => {
    const { lastTappedAt: _omit, ...rest } = baseDoc();
    const doc = new NetworkContactModel(rest);
    expect(doc.validateSync()?.errors['lastTappedAt']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// status enum
// ---------------------------------------------------------------------------

describe('NetworkContact schema – status enum', () => {
  it('accepts status "saved"', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), status: 'saved' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts status "unavailable"', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), status: 'unavailable' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid status value', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), status: 'pending' });
    expect(doc.validateSync()?.errors['status']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// source enum
// ---------------------------------------------------------------------------

describe('NetworkContact schema – source enum', () => {
  it.each(['nfc', 'qr', 'link', 'scan'] as const)(
    'accepts source "%s"',
    (source) => {
      const doc = new NetworkContactModel({ ...baseDoc(), source });
      expect(doc.validateSync()).toBeUndefined();
    },
  );

  it('rejects an invalid source value', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), source: 'bluetooth' });
    expect(doc.validateSync()?.errors['source']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// modeAtSave enum
// ---------------------------------------------------------------------------

describe('NetworkContact schema – modeAtSave enum', () => {
  it('accepts modeAtSave "work"', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), modeAtSave: 'work' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts modeAtSave "casual"', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), modeAtSave: 'casual' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid modeAtSave value', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), modeAtSave: 'party' });
    expect(doc.validateSync()?.errors['modeAtSave']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// tapCount constraint
// ---------------------------------------------------------------------------

describe('NetworkContact schema – tapCount', () => {
  it('accepts tapCount of 1', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), tapCount: 1 });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts tapCount greater than 1', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), tapCount: 42 });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects tapCount of 0', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), tapCount: 0 });
    expect(doc.validateSync()?.errors['tapCount']).toBeDefined();
  });

  it('rejects a negative tapCount', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), tapCount: -1 });
    expect(doc.validateSync()?.errors['tapCount']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Optional fields
// ---------------------------------------------------------------------------

describe('NetworkContact schema – optional fields absent by default', () => {
  it('leaves targetUserId undefined', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.targetUserId).toBeUndefined();
  });

  it('leaves snapshot undefined', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.snapshot).toBeUndefined();
  });

  it('leaves modeAtSave undefined', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.modeAtSave).toBeUndefined();
  });

  it('leaves note undefined', () => {
    const doc = new NetworkContactModel(baseDoc());
    expect(doc.note).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// snapshot sub-document
// ---------------------------------------------------------------------------

describe('NetworkContact schema – snapshot sub-document', () => {
  it('stores snapshot with all fields', () => {
    const snapshot = {
      name: 'Jane Doe',
      designation: 'Engineer',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
    };
    const doc = new NetworkContactModel({ ...baseDoc(), snapshot });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.snapshot?.name).toBe('Jane Doe');
    expect(doc.snapshot?.designation).toBe('Engineer');
    expect(doc.snapshot?.avatarUrl).toBe('https://cdn.example.com/avatar.jpg');
  });

  it('stores snapshot with only some fields', () => {
    const doc = new NetworkContactModel({
      ...baseDoc(),
      snapshot: { name: 'Alice' },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.snapshot?.name).toBe('Alice');
    expect(doc.snapshot?.designation).toBeUndefined();
    expect(doc.snapshot?.avatarUrl).toBeUndefined();
  });

  it('stores an empty snapshot without errors', () => {
    const doc = new NetworkContactModel({ ...baseDoc(), snapshot: {} });
    expect(doc.validateSync()).toBeUndefined();
  });
});
