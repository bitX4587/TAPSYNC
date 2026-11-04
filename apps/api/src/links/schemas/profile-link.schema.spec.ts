/**
 * Unit tests for the ProfileLink Mongoose schema.
 *
 * Uses Mongoose's schema/document validation layer directly — no database
 * connection required. Documents are created from a locally-registered model
 * and checked with `validateSync()`.
 *
 * Covers:
 *  - Default field values (isEnabled, clickCount, icon, category)
 *  - Required field enforcement (userId, mode, title, url, priorityOrder)
 *  - Enum constraint on `mode`
 *  - `clickCount` minimum value (0)
 *  - `title` and `url` trim behaviour
 *  - Compound index `{ userId: 1, mode: 1, priorityOrder: 1 }` registration
 *
 * Requirements: 3.1–3.9
 */

import mongoose, { Schema as MongooseSchema } from 'mongoose';
import { ProfileLink, ProfileLinkSchema } from './profile-link.schema.js';

// Create a standalone, in-memory-only model (no live connection needed for
// validateSync() tests).
const ProfileLinkModel = mongoose.model<ProfileLink>(
  ProfileLink.name + '_test',
  ProfileLinkSchema,
);

/** Minimal valid fields needed to pass validation. */
const validBase = () => ({
  userId: new mongoose.Types.ObjectId(),
  mode: 'work' as const,
  title: 'My GitHub',
  url: 'https://github.com/example',
  priorityOrder: 0,
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('ProfileLink schema – defaults', () => {
  it('sets isEnabled to true', () => {
    const doc = new ProfileLinkModel(validBase());
    expect(doc.isEnabled).toBe(true);
  });

  it('sets clickCount to 0', () => {
    const doc = new ProfileLinkModel(validBase());
    expect(doc.clickCount).toBe(0);
  });

  it('sets icon to "custom"', () => {
    const doc = new ProfileLinkModel(validBase());
    expect(doc.icon).toBe('custom');
  });

  it('sets category to "custom"', () => {
    const doc = new ProfileLinkModel(validBase());
    expect(doc.category).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// Required fields
// ---------------------------------------------------------------------------

describe('ProfileLink schema – required fields', () => {
  it('passes validation with all required fields supplied', () => {
    const doc = new ProfileLinkModel(validBase());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('fails validation when userId is missing', () => {
    const { userId: _omit, ...rest } = validBase();
    const doc = new ProfileLinkModel(rest);
    expect(doc.validateSync()?.errors['userId']).toBeDefined();
  });

  it('fails validation when mode is missing', () => {
    const { mode: _omit, ...rest } = validBase();
    const doc = new ProfileLinkModel(rest);
    expect(doc.validateSync()?.errors['mode']).toBeDefined();
  });

  it('fails validation when title is missing', () => {
    const { title: _omit, ...rest } = validBase();
    const doc = new ProfileLinkModel(rest);
    expect(doc.validateSync()?.errors['title']).toBeDefined();
  });

  it('fails validation when url is missing', () => {
    const { url: _omit, ...rest } = validBase();
    const doc = new ProfileLinkModel(rest);
    expect(doc.validateSync()?.errors['url']).toBeDefined();
  });

  it('fails validation when priorityOrder is missing', () => {
    const { priorityOrder: _omit, ...rest } = validBase();
    const doc = new ProfileLinkModel(rest);
    expect(doc.validateSync()?.errors['priorityOrder']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Mode enum constraint
// ---------------------------------------------------------------------------

describe('ProfileLink schema – mode enum', () => {
  it('accepts mode "work"', () => {
    const doc = new ProfileLinkModel({ ...validBase(), mode: 'work' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts mode "casual"', () => {
    const doc = new ProfileLinkModel({ ...validBase(), mode: 'casual' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid mode value', () => {
    const doc = new ProfileLinkModel({ ...validBase(), mode: 'party' });
    expect(doc.validateSync()?.errors['mode']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// clickCount minimum constraint
// ---------------------------------------------------------------------------

describe('ProfileLink schema – clickCount constraints', () => {
  it('accepts clickCount of 0', () => {
    const doc = new ProfileLinkModel({ ...validBase(), clickCount: 0 });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('accepts a positive clickCount', () => {
    const doc = new ProfileLinkModel({ ...validBase(), clickCount: 42 });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a negative clickCount', () => {
    const doc = new ProfileLinkModel({ ...validBase(), clickCount: -1 });
    expect(doc.validateSync()?.errors['clickCount']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isEnabled flag
// ---------------------------------------------------------------------------

describe('ProfileLink schema – isEnabled flag', () => {
  it('can be set to false explicitly', () => {
    const doc = new ProfileLinkModel({ ...validBase(), isEnabled: false });
    expect(doc.isEnabled).toBe(false);
    expect(doc.validateSync()).toBeUndefined();
  });

  it('can be set to true explicitly', () => {
    const doc = new ProfileLinkModel({ ...validBase(), isEnabled: true });
    expect(doc.isEnabled).toBe(true);
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// String trimming
// ---------------------------------------------------------------------------

describe('ProfileLink schema – string trimming', () => {
  it('trims leading/trailing whitespace from title', () => {
    const doc = new ProfileLinkModel({ ...validBase(), title: '  GitHub  ' });
    expect(doc.title).toBe('GitHub');
  });

  it('trims leading/trailing whitespace from url', () => {
    const doc = new ProfileLinkModel({
      ...validBase(),
      url: '  https://github.com/example  ',
    });
    expect(doc.url).toBe('https://github.com/example');
  });
});

// ---------------------------------------------------------------------------
// Custom icon and category values
// ---------------------------------------------------------------------------

describe('ProfileLink schema – icon and category fields', () => {
  it('stores a named icon key (e.g. "linkedin")', () => {
    const doc = new ProfileLinkModel({ ...validBase(), icon: 'linkedin' });
    expect(doc.icon).toBe('linkedin');
    expect(doc.validateSync()).toBeUndefined();
  });

  it('stores a named category key (e.g. "github")', () => {
    const doc = new ProfileLinkModel({ ...validBase(), category: 'github' });
    expect(doc.category).toBe('github');
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Compound index registration
// ---------------------------------------------------------------------------

describe('ProfileLink schema – compound index', () => {
  it('registers the { userId, mode, priorityOrder } compound index', () => {
    const indexes = ProfileLinkSchema.indexes() as Array<
      [Record<string, unknown>, Record<string, unknown>]
    >;

    const match = indexes.find(([fields]) => {
      return (
        fields['userId'] === 1 &&
        fields['mode'] === 1 &&
        fields['priorityOrder'] === 1
      );
    });

    expect(match).toBeDefined();
  });
});
