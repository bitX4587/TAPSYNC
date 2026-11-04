/**
 * Local SQLite store for My Network.
 *
 * Backs two offline concerns (Requirement 12.5, 12.6, 12.10):
 *
 *   1. **Pending entries** — My Network saves performed while offline. Each row
 *      stores a Public ID, source, the tap time and the mode shown at save. They
 *      are drained via `POST /network/sync` once connectivity returns.
 *   2. **Cached contacts** — an offline cache of the user's My Network list so
 *      the tab can render without a network round-trip. The server is the source
 *      of truth, so bulk upsert *replaces* the local cache with the server list.
 *
 * Uses `expo-sqlite` (v15 sync API) with a lazily-initialised singleton database.
 * All data access uses parameterised queries to prevent SQL injection, and every
 * date is stored as an ISO 8601 string.
 */

import * as SQLite from 'expo-sqlite';
import type {
  Mode,
  NetworkContactDto,
  NetworkContactSnapshotDto,
  NetworkContactSource,
  NetworkContactStatus,
} from '@tapsync/shared';

/** The SQLite database file name. */
const DB_NAME = 'tapsync_network.db';

// ---------------------------------------------------------------------------
// Row / entity types
// ---------------------------------------------------------------------------

/** A pending (not-yet-synced) My Network save. */
export interface PendingEntry {
  id: number;
  publicId: string;
  source: NetworkContactSource;
  tappedAt: string;
  modeAtSave: Mode | null;
  createdAt: string;
}

interface PendingEntryRow {
  id: number;
  publicId: string;
  source: string;
  tappedAt: string;
  modeAtSave: string | null;
  createdAt: string;
}

/** Flattened mirror of {@link NetworkContactDto} for storage. */
interface CachedContactRow {
  id: string;
  publicId: string;
  status: string;
  snapshotName: string | null;
  snapshotDesignation: string | null;
  snapshotAvatarUrl: string | null;
  source: string;
  modeAtSave: string | null;
  note: string | null;
  tapCount: number;
  firstSavedAt: string;
  lastTappedAt: string;
  cachedAt: string;
}

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

let db: SQLite.SQLiteDatabase | null = null;

/** Get the lazily-opened singleton database handle. */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
  }
  return db;
}

/**
 * Create the local tables if they do not already exist.
 *
 * Safe to call repeatedly — `IF NOT EXISTS` makes it idempotent. This is invoked
 * automatically by every operation, so callers do not need to manage lifecycle.
 */
export function initDatabase(): void {
  getDb().execSync(`
    CREATE TABLE IF NOT EXISTS pending_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publicId TEXT NOT NULL,
      source TEXT NOT NULL,
      tappedAt TEXT NOT NULL,
      modeAtSave TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cached_contacts (
      id TEXT PRIMARY KEY,
      publicId TEXT NOT NULL,
      status TEXT NOT NULL,
      snapshotName TEXT,
      snapshotDesignation TEXT,
      snapshotAvatarUrl TEXT,
      source TEXT NOT NULL,
      modeAtSave TEXT,
      note TEXT,
      tapCount INTEGER NOT NULL DEFAULT 0,
      firstSavedAt TEXT NOT NULL,
      lastTappedAt TEXT NOT NULL,
      cachedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ---------------------------------------------------------------------------
// Row <-> DTO mapping
// ---------------------------------------------------------------------------

function rowToPendingEntry(row: PendingEntryRow): PendingEntry {
  return {
    id: row.id,
    publicId: row.publicId,
    source: row.source as NetworkContactSource,
    tappedAt: row.tappedAt,
    modeAtSave: row.modeAtSave ? (row.modeAtSave as Mode) : null,
    createdAt: row.createdAt,
  };
}

function rowToContact(row: CachedContactRow): NetworkContactDto {
  const contact: NetworkContactDto = {
    id: row.id,
    publicId: row.publicId,
    status: row.status as NetworkContactStatus,
    source: row.source as NetworkContactSource,
    tapCount: row.tapCount,
    firstSavedAt: row.firstSavedAt,
    lastTappedAt: row.lastTappedAt,
  };

  if (row.modeAtSave) {
    contact.modeAtSave = row.modeAtSave as Mode;
  }
  if (row.note) {
    contact.note = row.note;
  }

  // Rebuild the snapshot only when at least one snapshot field is present.
  const snapshot: NetworkContactSnapshotDto = {};
  let hasSnapshot = false;
  if (row.snapshotName) {
    snapshot.name = row.snapshotName;
    hasSnapshot = true;
  }
  if (row.snapshotDesignation) {
    snapshot.designation = row.snapshotDesignation;
    hasSnapshot = true;
  }
  if (row.snapshotAvatarUrl) {
    snapshot.avatarUrl = row.snapshotAvatarUrl;
    hasSnapshot = true;
  }
  if (hasSnapshot) {
    contact.snapshot = snapshot;
  }

  return contact;
}

// ---------------------------------------------------------------------------
// Pending entries — Requirement 12.5
// ---------------------------------------------------------------------------

/**
 * Queue a My Network save for later sync.
 *
 * @returns the auto-generated row id.
 */
export function addPendingEntry(
  publicId: string,
  source: NetworkContactSource,
  tappedAt: string = new Date().toISOString(),
  modeAtSave?: Mode,
): number {
  initDatabase();
  const result = getDb().runSync(
    'INSERT INTO pending_entries (publicId, source, tappedAt, modeAtSave) VALUES (?, ?, ?, ?)',
    [publicId, source, tappedAt, modeAtSave ?? null],
  );
  return result.lastInsertRowId;
}

/**
 * Retrieve pending entries, oldest first (FIFO sync order). Ties on the
 * second-precision `createdAt` are broken by `id` so insertion order is stable.
 *
 * @param limit Optional maximum number of entries to return.
 */
export function getPendingEntries(limit?: number): PendingEntry[] {
  initDatabase();
  const rows =
    limit !== undefined
      ? getDb().getAllSync<PendingEntryRow>(
          'SELECT * FROM pending_entries ORDER BY createdAt ASC, id ASC LIMIT ?',
          [limit],
        )
      : getDb().getAllSync<PendingEntryRow>(
          'SELECT * FROM pending_entries ORDER BY createdAt ASC, id ASC',
        );
  return rows.map(rowToPendingEntry);
}

/** Remove a pending entry after it has been synced successfully. */
export function deletePendingEntry(id: number): void {
  initDatabase();
  getDb().runSync('DELETE FROM pending_entries WHERE id = ?', [id]);
}

/** Remove every pending entry (used after a full sync or for testing/reset). */
export function clearPendingEntries(): void {
  initDatabase();
  getDb().runSync('DELETE FROM pending_entries');
}

/** Number of pending entries, for UI badges and sync decisions. */
export function getPendingCount(): number {
  initDatabase();
  const row = getDb().getFirstSync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM pending_entries',
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Cached contacts — offline mirror of My Network (Requirement 12.6, 12.10)
// ---------------------------------------------------------------------------

/** Insert or replace a single cached contact by its server id. */
export function upsertCachedContact(contact: NetworkContactDto): void {
  initDatabase();
  getDb().runSync(
    `INSERT OR REPLACE INTO cached_contacts (
      id, publicId, status,
      snapshotName, snapshotDesignation, snapshotAvatarUrl,
      source, modeAtSave, note, tapCount, firstSavedAt, lastTappedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contact.id,
      contact.publicId,
      contact.status,
      contact.snapshot?.name ?? null,
      contact.snapshot?.designation ?? null,
      contact.snapshot?.avatarUrl ?? null,
      contact.source,
      contact.modeAtSave ?? null,
      contact.note ?? null,
      contact.tapCount,
      contact.firstSavedAt,
      contact.lastTappedAt,
    ],
  );
}

/**
 * Replace the entire local cache with the given list. The server is the source
 * of truth for My Network, so this deletes everything and re-inserts the
 * server-provided contacts atomically.
 */
export function upsertCachedContacts(contacts: NetworkContactDto[]): void {
  initDatabase();
  getDb().withTransactionSync(() => {
    getDb().runSync('DELETE FROM cached_contacts');
    for (const contact of contacts) {
      upsertCachedContact(contact);
    }
  });
}

/** All cached contacts, most-recently-tapped first (matches the server list order). */
export function getCachedContacts(): NetworkContactDto[] {
  initDatabase();
  const rows = getDb().getAllSync<CachedContactRow>(
    'SELECT * FROM cached_contacts ORDER BY lastTappedAt DESC',
  );
  return rows.map(rowToContact);
}

/** A single cached contact by Public ID, or `null` when absent. */
export function getCachedContact(publicId: string): NetworkContactDto | null {
  initDatabase();
  const row = getDb().getFirstSync<CachedContactRow>(
    'SELECT * FROM cached_contacts WHERE publicId = ? LIMIT 1',
    [publicId],
  );
  return row ? rowToContact(row) : null;
}

/** Remove a cached contact by its server id. */
export function deleteCachedContact(id: string): void {
  initDatabase();
  getDb().runSync('DELETE FROM cached_contacts WHERE id = ?', [id]);
}

/** Update the private note on a cached contact. */
export function updateCachedContactNote(id: string, note: string): void {
  initDatabase();
  getDb().runSync('UPDATE cached_contacts SET note = ? WHERE id = ?', [note, id]);
}

/** Remove every cached contact (for testing/reset). */
export function clearCachedContacts(): void {
  initDatabase();
  getDb().runSync('DELETE FROM cached_contacts');
}

// ---------------------------------------------------------------------------
// Test-only helpers (exposed for unit-test isolation)
// ---------------------------------------------------------------------------

/** Drop the singleton handle so the next call re-opens a fresh database. */
export function __resetDatabaseForTesting(): void {
  db = null;
}
