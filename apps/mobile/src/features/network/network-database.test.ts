/**
 * Unit tests for the local SQLite store (My Network pending queue + offline cache).
 *
 * Covers (Requirement 12.5, 12.6, 12.10):
 *  - Pending entries: add, retrieve (FIFO order), delete, count, clear, duplicates
 *  - Cached contacts: upsert, bulk upsert (replace all), get all (ordered by
 *    lastTappedAt DESC), get by publicId, delete, update note, clear
 *  - Idempotent initialisation (calling initDatabase twice does not error)
 *  - Duplicate pending entries for the same publicId are both stored (the server's
 *    idempotent upsert deduplicates them on sync)
 *
 * The tests run against the in-memory `expo-sqlite` mock (src/__mocks__/expo-sqlite.ts),
 * wired via moduleNameMapper in jest.config.js.
 */

import {
  addPendingEntry,
  getPendingEntries,
  deletePendingEntry,
  clearPendingEntries,
  getPendingCount,
  upsertCachedContact,
  upsertCachedContacts,
  getCachedContacts,
  getCachedContact,
  deleteCachedContact,
  updateCachedContactNote,
  clearCachedContacts,
  initDatabase,
  __resetDatabaseForTesting,
} from './network-database';
// `expo-sqlite` is remapped to our in-memory mock (see jest.config.js
// moduleNameMapper). The real package types do not expose the test-only reset
// helper, so we cast the namespace to access it at runtime.
import * as SQLiteMock from 'expo-sqlite';
import { Mode, type NetworkContactDto } from '@tapsync/shared';

const { __clearAllMockDatabases } = SQLiteMock as unknown as {
  __clearAllMockDatabases: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContact(overrides: Partial<NetworkContactDto> = {}): NetworkContactDto {
  return {
    id: 'contact-1',
    publicId: 'abcdefghjk',
    status: 'saved',
    source: 'link',
    tapCount: 1,
    firstSavedAt: '2024-01-01T00:00:00.000Z',
    lastTappedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  __clearAllMockDatabases();
  __resetDatabaseForTesting();
});

// ---------------------------------------------------------------------------
// Pending entries
// ---------------------------------------------------------------------------

describe('pending entries', () => {
  describe('addPendingEntry', () => {
    it('inserts an entry and returns a positive row id', () => {
      const id = addPendingEntry('abcdefghjk', 'nfc');
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('assigns incrementing ids across inserts', () => {
      const id1 = addPendingEntry('abcdefghjk', 'nfc');
      const id2 = addPendingEntry('bcdefghjkm', 'qr');
      expect(id2).toBe(id1 + 1);
    });

    it('defaults tappedAt to the current time when omitted', () => {
      const before = Date.now();
      addPendingEntry('abcdefghjk', 'link');
      const entries = getPendingEntries();
      const after = Date.now();
      expect(entries).toHaveLength(1);
      const tappedAtMs = new Date(entries[0].tappedAt).getTime();
      expect(tappedAtMs).toBeGreaterThanOrEqual(before);
      expect(tappedAtMs).toBeLessThanOrEqual(after);
    });

    it('stores an explicit tappedAt and modeAtSave', () => {
      addPendingEntry('abcdefghjk', 'scan', '2024-05-01T10:00:00.000Z', Mode.Work);
      const [entry] = getPendingEntries();
      expect(entry.publicId).toBe('abcdefghjk');
      expect(entry.source).toBe('scan');
      expect(entry.tappedAt).toBe('2024-05-01T10:00:00.000Z');
      expect(entry.modeAtSave).toBe(Mode.Work);
    });

    it('stores modeAtSave as null when omitted', () => {
      addPendingEntry('abcdefghjk', 'nfc');
      const [entry] = getPendingEntries();
      expect(entry.modeAtSave).toBeNull();
    });
  });

  describe('getPendingEntries (FIFO order)', () => {
    it('returns entries oldest-first by insertion order', () => {
      addPendingEntry('aaaaaaaaaa', 'nfc', '2024-01-01T00:00:00.000Z');
      addPendingEntry('bbbbbbbbbb', 'qr', '2024-01-02T00:00:00.000Z');
      addPendingEntry('cccccccccc', 'link', '2024-01-03T00:00:00.000Z');

      const entries = getPendingEntries();
      expect(entries.map((e) => e.publicId)).toEqual([
        'aaaaaaaaaa',
        'bbbbbbbbbb',
        'cccccccccc',
      ]);
    });

    it('respects a limit', () => {
      addPendingEntry('aaaaaaaaaa', 'nfc');
      addPendingEntry('bbbbbbbbbb', 'qr');
      addPendingEntry('cccccccccc', 'link');

      const entries = getPendingEntries(2);
      expect(entries).toHaveLength(2);
      expect(entries[0].publicId).toBe('aaaaaaaaaa');
      expect(entries[1].publicId).toBe('bbbbbbbbbb');
    });

    it('returns an empty array when nothing is pending', () => {
      expect(getPendingEntries()).toEqual([]);
    });
  });

  describe('deletePendingEntry', () => {
    it('removes only the entry with the matching id', () => {
      const id1 = addPendingEntry('aaaaaaaaaa', 'nfc');
      const id2 = addPendingEntry('bbbbbbbbbb', 'qr');

      deletePendingEntry(id1);

      const entries = getPendingEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(id2);
    });

    it('is a no-op when the id does not exist', () => {
      addPendingEntry('aaaaaaaaaa', 'nfc');
      deletePendingEntry(9999);
      expect(getPendingEntries()).toHaveLength(1);
    });
  });

  describe('getPendingCount', () => {
    it('counts pending entries', () => {
      expect(getPendingCount()).toBe(0);
      addPendingEntry('aaaaaaaaaa', 'nfc');
      addPendingEntry('bbbbbbbbbb', 'qr');
      expect(getPendingCount()).toBe(2);
    });

    it('decrements after a deletion', () => {
      const id = addPendingEntry('aaaaaaaaaa', 'nfc');
      expect(getPendingCount()).toBe(1);
      deletePendingEntry(id);
      expect(getPendingCount()).toBe(0);
    });
  });

  describe('clearPendingEntries', () => {
    it('removes every pending entry', () => {
      addPendingEntry('aaaaaaaaaa', 'nfc');
      addPendingEntry('bbbbbbbbbb', 'qr');
      clearPendingEntries();
      expect(getPendingEntries()).toEqual([]);
      expect(getPendingCount()).toBe(0);
    });
  });

  describe('duplicate publicIds', () => {
    it('stores multiple pending entries for the same publicId (server dedupes on sync)', () => {
      addPendingEntry('abcdefghjk', 'nfc', '2024-01-01T00:00:00.000Z');
      addPendingEntry('abcdefghjk', 'qr', '2024-01-02T00:00:00.000Z');

      const entries = getPendingEntries();
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.publicId === 'abcdefghjk')).toBe(true);
      expect(entries[0].source).toBe('nfc');
      expect(entries[1].source).toBe('qr');
    });
  });
});

// ---------------------------------------------------------------------------
// Cached contacts
// ---------------------------------------------------------------------------

describe('cached contacts', () => {
  describe('upsertCachedContact', () => {
    it('inserts a contact that can be read back', () => {
      upsertCachedContact(makeContact());
      const contacts = getCachedContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].id).toBe('contact-1');
      expect(contacts[0].publicId).toBe('abcdefghjk');
      expect(contacts[0].status).toBe('saved');
      expect(contacts[0].source).toBe('link');
      expect(contacts[0].tapCount).toBe(1);
    });

    it('stores the full snapshot fields', () => {
      upsertCachedContact(
        makeContact({
          snapshot: {
            name: 'Jane Doe',
            designation: 'Engineer',
            avatarUrl: 'https://cdn.tapsync.app/a.png',
          },
        }),
      );
      const [contact] = getCachedContacts();
      expect(contact.snapshot).toEqual({
        name: 'Jane Doe',
        designation: 'Engineer',
        avatarUrl: 'https://cdn.tapsync.app/a.png',
      });
    });

    it('replaces an existing contact with the same server id (INSERT OR REPLACE)', () => {
      upsertCachedContact(makeContact({ tapCount: 1, snapshot: { name: 'Old' } }));
      upsertCachedContact(
        makeContact({ tapCount: 3, snapshot: { name: 'New' } }),
      );
      const contacts = getCachedContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].tapCount).toBe(3);
      expect(contacts[0].snapshot?.name).toBe('New');
    });

    it('persists modeAtSave and note when provided', () => {
      upsertCachedContact(
        makeContact({ modeAtSave: Mode.Casual, note: 'Met at conference' }),
      );
      const [contact] = getCachedContacts();
      expect(contact.modeAtSave).toBe(Mode.Casual);
      expect(contact.note).toBe('Met at conference');
    });

    it('omits snapshot/modeAtSave/note from the DTO when absent', () => {
      upsertCachedContact(makeContact());
      const [contact] = getCachedContacts();
      expect(contact.snapshot).toBeUndefined();
      expect(contact.modeAtSave).toBeUndefined();
      expect(contact.note).toBeUndefined();
    });
  });

  describe('upsertCachedContacts (bulk replace)', () => {
    it('replaces the entire cache with the given list', () => {
      upsertCachedContact(makeContact({ id: 'old-1', publicId: 'aaaaaaaaaa' }));
      upsertCachedContact(makeContact({ id: 'old-2', publicId: 'bbbbbbbbbb' }));

      upsertCachedContacts([
        makeContact({ id: 'new-1', publicId: 'cccccccccc', lastTappedAt: '2024-03-01T00:00:00.000Z' }),
        makeContact({ id: 'new-2', publicId: 'dddddddddd', lastTappedAt: '2024-02-01T00:00:00.000Z' }),
      ]);

      const contacts = getCachedContacts();
      expect(contacts).toHaveLength(2);
      expect(contacts.map((c) => c.id).sort()).toEqual(['new-1', 'new-2']);
    });

    it('clears the cache when given an empty list', () => {
      upsertCachedContact(makeContact({ id: 'old-1', publicId: 'aaaaaaaaaa' }));
      upsertCachedContacts([]);
      expect(getCachedContacts()).toEqual([]);
    });
  });

  describe('getCachedContacts (order)', () => {
    it('returns contacts ordered by lastTappedAt descending', () => {
      upsertCachedContact(makeContact({ id: 'a', lastTappedAt: '2024-01-01T00:00:00.000Z' }));
      upsertCachedContact(makeContact({ id: 'b', lastTappedAt: '2024-03-01T00:00:00.000Z' }));
      upsertCachedContact(makeContact({ id: 'c', lastTappedAt: '2024-02-01T00:00:00.000Z' }));

      const contacts = getCachedContacts();
      expect(contacts.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('getCachedContact', () => {
    it('returns the contact matching the publicId', () => {
      upsertCachedContact(makeContact({ id: 'c1', publicId: 'abcdefghjk' }));
      const contact = getCachedContact('abcdefghjk');
      expect(contact).not.toBeNull();
      expect(contact?.id).toBe('c1');
    });

    it('returns null when no contact matches', () => {
      upsertCachedContact(makeContact({ id: 'c1', publicId: 'abcdefghjk' }));
      expect(getCachedContact('zzzzzzzzzz')).toBeNull();
    });

    it('returns null when the cache is empty', () => {
      expect(getCachedContact('abcdefghjk')).toBeNull();
    });
  });

  describe('deleteCachedContact', () => {
    it('removes the contact by server id', () => {
      upsertCachedContact(makeContact({ id: 'c1', publicId: 'abcdefghjk' }));
      upsertCachedContact(makeContact({ id: 'c2', publicId: 'bcdefghjkm' }));

      deleteCachedContact('c1');
      const contacts = getCachedContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].id).toBe('c2');
    });

    it('is a no-op when the id does not exist', () => {
      upsertCachedContact(makeContact({ id: 'c1', publicId: 'abcdefghjk' }));
      deleteCachedContact('does-not-exist');
      expect(getCachedContacts()).toHaveLength(1);
    });
  });

  describe('updateCachedContactNote', () => {
    it('updates the note on an existing contact', () => {
      upsertCachedContact(makeContact({ id: 'c1', note: 'old note' }));
      updateCachedContactNote('c1', 'updated note');
      const contact = getCachedContact('abcdefghjk');
      expect(contact?.note).toBe('updated note');
    });

    it('sets a note where none existed', () => {
      upsertCachedContact(makeContact({ id: 'c1' }));
      updateCachedContactNote('c1', 'first note');
      expect(getCachedContact('abcdefghjk')?.note).toBe('first note');
    });

    it('does not affect other fields', () => {
      upsertCachedContact(
        makeContact({ id: 'c1', tapCount: 5, snapshot: { name: 'Jane' } }),
      );
      updateCachedContactNote('c1', 'note');
      const contact = getCachedContact('abcdefghjk');
      expect(contact?.tapCount).toBe(5);
      expect(contact?.snapshot?.name).toBe('Jane');
    });
  });

  describe('clearCachedContacts', () => {
    it('removes every cached contact', () => {
      upsertCachedContact(makeContact({ id: 'c1' }));
      upsertCachedContact(makeContact({ id: 'c2', publicId: 'bcdefghjkm' }));
      clearCachedContacts();
      expect(getCachedContacts()).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

describe('initDatabase', () => {
  it('is idempotent — calling it twice does not throw', () => {
    expect(() => {
      initDatabase();
      initDatabase();
    }).not.toThrow();
  });

  it('does not lose existing data when called again', () => {
    addPendingEntry('abcdefghjk', 'nfc');
    upsertCachedContact(makeContact({ id: 'c1' }));

    initDatabase();

    expect(getPendingCount()).toBe(1);
    expect(getCachedContacts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

describe('test isolation', () => {
  it('starts each test with an empty database', () => {
    expect(getPendingEntries()).toEqual([]);
    expect(getCachedContacts()).toEqual([]);
  });
});
