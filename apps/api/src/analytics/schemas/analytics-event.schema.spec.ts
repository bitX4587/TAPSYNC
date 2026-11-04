/**
 * Unit tests for the AnalyticsEvent Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly (no database
 * connection required). We instantiate documents from a locally-created
 * model and call `validateSync()` to exercise the schema constraints.
 *
 * Covers:
 *  - Required field enforcement (userId, type, mode, occurredAt)
 *  - Enum constraints for type, mode and deviceType
 *  - Optional fields are absent by default
 *  - linkId accepts a valid ObjectId
 *  - sessionHash, country, referrer are stored when provided
 *
 * Requirements: 8.1–8.9
 */

import mongoose from 'mongoose';
import { AnalyticsEvent, AnalyticsEventSchema } from './analytics-event.schema.js';

// Create a standalone in-memory-only model (no live connection needed for
// validateSync() tests).
const AnalyticsEventModel = mongoose.model<AnalyticsEvent>(
  AnalyticsEvent.name + '_test',
  AnalyticsEventSchema,
);

const VALID_USER_ID = new mongoose.Types.ObjectId();
const VALID_OCCURRED_AT = new Date('2024-06-01T12:00:00Z');

const VALID_DOC = {
  userId: VALID_USER_ID,
  type: 'view' as const,
  mode: 'work' as const,
  occurredAt: VALID_OCCURRED_AT,
};

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – required fields', () => {
  it('passes validation when all required fields are supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when userId is missing', () => {
    const { userId: _omit, ...rest } = VALID_DOC;
    const doc = new AnalyticsEventModel(rest);
    expect(doc.validateSync()?.errors['userId']).toBeDefined();
  });

  it('fails validation when type is missing', () => {
    const { type: _omit, ...rest } = VALID_DOC;
    const doc = new AnalyticsEventModel(rest);
    expect(doc.validateSync()?.errors['type']).toBeDefined();
  });

  it('fails validation when mode is missing', () => {
    const { mode: _omit, ...rest } = VALID_DOC;
    const doc = new AnalyticsEventModel(rest);
    expect(doc.validateSync()?.errors['mode']).toBeDefined();
  });

  it('fails validation when occurredAt is missing', () => {
    const { occurredAt: _omit, ...rest } = VALID_DOC;
    const doc = new AnalyticsEventModel(rest);
    expect(doc.validateSync()?.errors['occurredAt']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// type enum
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – type enum', () => {
  it('accepts type "view"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, type: 'view' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts type "link_click"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, type: 'link_click' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts type "contact_save"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, type: 'contact_save' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid type value', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, type: 'purchase' });
    expect(doc.validateSync()?.errors['type']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// mode enum
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – mode enum', () => {
  it('accepts mode "work"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, mode: 'work' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts mode "casual"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, mode: 'casual' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid mode value', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, mode: 'party' });
    expect(doc.validateSync()?.errors['mode']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deviceType enum
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – deviceType enum', () => {
  it('accepts deviceType "ios"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, deviceType: 'ios' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts deviceType "android"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, deviceType: 'android' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts deviceType "desktop"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, deviceType: 'desktop' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts deviceType "other"', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, deviceType: 'other' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid deviceType value', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, deviceType: 'smartwatch' });
    expect(doc.validateSync()?.errors['deviceType']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Optional fields absent by default
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – optional fields', () => {
  it('leaves linkId undefined when not supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.linkId).toBeUndefined();
  });

  it('leaves country undefined when not supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.country).toBeUndefined();
  });

  it('leaves deviceType undefined when not supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.deviceType).toBeUndefined();
  });

  it('leaves referrer undefined when not supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.referrer).toBeUndefined();
  });

  it('leaves sessionHash undefined when not supplied', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.sessionHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// linkId field
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – linkId field', () => {
  it('accepts a valid ObjectId for linkId', () => {
    const linkId = new mongoose.Types.ObjectId();
    const doc = new AnalyticsEventModel({ ...VALID_DOC, linkId });
    expect(doc.linkId?.toString()).toBe(linkId.toString());
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// String fields stored when provided
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – string fields', () => {
  it('stores country when provided', () => {
    const doc = new AnalyticsEventModel({ ...VALID_DOC, country: 'PH' });
    expect(doc.country).toBe('PH');
    expect(doc.validateSync()).toBeUndefined();
  });

  it('stores referrer when provided', () => {
    const doc = new AnalyticsEventModel({
      ...VALID_DOC,
      referrer: 'https://example.com',
    });
    expect(doc.referrer).toBe('https://example.com');
    expect(doc.validateSync()).toBeUndefined();
  });

  it('stores sessionHash when provided', () => {
    const hash = 'abc123hash';
    const doc = new AnalyticsEventModel({ ...VALID_DOC, sessionHash: hash });
    expect(doc.sessionHash).toBe(hash);
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// occurredAt field
// ---------------------------------------------------------------------------

describe('AnalyticsEvent schema – occurredAt field', () => {
  it('stores occurredAt as a Date', () => {
    const doc = new AnalyticsEventModel(VALID_DOC);
    expect(doc.occurredAt).toBeInstanceOf(Date);
    expect(doc.occurredAt.toISOString()).toBe(VALID_OCCURRED_AT.toISOString());
  });
});
