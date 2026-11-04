/**
 * In-memory mock of `expo-sqlite` (v15 sync API) for Jest.
 *
 * The real `expo-sqlite` package is a native module that cannot run under Node,
 * so tests import this mock. It implements a focused subset of SQLite semantics
 * that is sufficient for the My Network local store:
 *
 *   - `openDatabaseSync(name)` returns a singleton-per-name `SQLiteDatabase`
 *   - `execSync(sql)` — `CREATE TABLE IF NOT EXISTS` (DDL)
 *   - `runSync(sql, params)` — `INSERT`, `INSERT OR REPLACE`, `DELETE`, `UPDATE`
 *   - `getFirstSync(sql, params)` / `getAllSync(sql, params)` — `SELECT`
 *   - `withTransactionSync(task)` — snapshot/rollback passthrough
 *
 * Supported SQL features: `?` positional placeholders, `INTEGER PRIMARY KEY
 * AUTOINCREMENT`, `TEXT PRIMARY KEY`, `DEFAULT CURRENT_TIMESTAMP` / `DEFAULT
 * (datetime('now'))`, `DEFAULT <literal>`, `NOT NULL`, `WHERE col = ? [AND col = ?]`,
 * `ORDER BY col [ASC|DESC], ...`, `LIMIT ?` / `LIMIT n`, and `COUNT(*) AS <alias>`.
 *
 * TypeScript uses the REAL `expo-sqlite` types (the package is installed), so this
 * file only needs to satisfy its own internal type-checking and provide the runtime
 * values. It is wired in via `moduleNameMapper` in `jest.config.js`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of bind values used by the My Network store. */
export type BindValue = string | number | null | boolean;

/** A row is a sparse map of column name to value. */
type Row = Record<string, BindValue | undefined>;

/** Result of a write operation, mirroring `SQLiteRunResult`. */
interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

interface ColumnDef {
  name: string;
  type: string;
  primaryKey: boolean;
  autoincrement: boolean;
  notNull: boolean;
  defaultValue?: BindValue;
  isNowDefault: boolean;
}

interface Table {
  name: string;
  columns: ColumnDef[];
  rows: Row[];
  nextAutoId: number;
}

interface Database {
  tables: Map<string, Table>;
}

/** The mocked `SQLiteDatabase`-shaped object returned by `openDatabaseSync`. */
export interface SQLiteDatabaseMock {
  databasePath: string;
  execSync(sql: string): void;
  runSync<T = Row>(sql: string, ...rest: unknown[]): RunResult & { firstRowValues?: unknown };
  getFirstSync<T = Row>(sql: string, ...rest: unknown[]): T | null;
  getAllSync<T = Row>(sql: string, ...rest: unknown[]): T[];
  withTransactionSync(task: () => void): void;
  closeSync(): void;
  isInTransactionSync(): boolean;
}

// ---------------------------------------------------------------------------
// Database registry (per database name)
// ---------------------------------------------------------------------------

const databases = new Map<string, Database>();

function getDatabase(name: string): Database {
  let db = databases.get(name);
  if (!db) {
    db = { tables: new Map() };
    databases.set(name, db);
  }
  return db;
}

/**
 * Clear every in-memory database. Call this in `beforeEach` to isolate tests.
 */
export function __clearAllMockDatabases(): void {
  databases.clear();
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  // Mimic SQLite `datetime('now')`: UTC, second precision, space-separated.
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function getTable(db: Database, name: string): Table {
  const t = db.tables.get(name);
  if (!t) {
    throw new Error(`[expo-sqlite mock] No such table: ${name}`);
  }
  return t;
}

/** Normalize the variadic/array argument forms into a flat value list. */
function normalizeRest(rest: unknown[]): BindValue[] {
  if (rest.length === 0) return [];
  if (rest.length === 1 && Array.isArray(rest[0])) return rest[0] as BindValue[];
  return rest as BindValue[];
}

/** Split on a separator character, respecting parentheses. */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

/** Split on a whole-word keyword (e.g. `AND`), respecting parentheses. */
function splitOnKeyword(s: string, keyword: string): string[] {
  const upper = s.toUpperCase();
  const kw = keyword.toUpperCase();
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && upper.slice(i, i + kw.length) === kw) {
      const before = i > 0 ? s[i - 1] : ' ';
      const after = s[i + kw.length] ?? ' ';
      if (/\s/.test(before) && /\s/.test(after)) {
        parts.push(current.trim());
        current = '';
        i += kw.length;
        continue;
      }
    }
    current += ch;
    i++;
  }
  const last = current.trim();
  if (last) parts.push(last);
  return parts;
}

/** Find the index of a whole-word keyword (paren-aware), or -1. */
function findKeyword(s: string, keyword: string): number {
  const upper = s.toUpperCase();
  const kw = keyword.toUpperCase();
  let depth = 0;
  for (let i = 0; i < upper.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    if (depth === 0 && upper.slice(i, i + kw.length) === kw) {
      const before = i > 0 ? s[i - 1] : ' ';
      const after = s[i + kw.length] ?? ' ';
      if (/\s/.test(before) && /\s/.test(after)) {
        return i;
      }
    }
  }
  return -1;
}

/** Split a multi-statement string on top-level semicolons. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of sql) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) statements.push(last);
  return statements;
}

// ---------------------------------------------------------------------------
// DDL
// ---------------------------------------------------------------------------

function parseColumnDef(def: string): ColumnDef {
  const trimmed = def.trim();
  const nameMatch = trimmed.match(/^(\w+)\s+(\w+)/);
  const name = nameMatch ? (nameMatch[1] as string) : (trimmed.split(/\s+/)[0] as string);
  const type = nameMatch ? (nameMatch[2] as string) : '';
  const upper = trimmed.toUpperCase();

  const primaryKey = /\bPRIMARY\s+KEY\b/.test(upper);
  const autoincrement = /\bAUTOINCREMENT\b/.test(upper);
  const notNull = /\bNOT\s+NULL\b/.test(upper);

  let defaultValue: BindValue | undefined;
  let isNowDefault = false;
  const defaultIdx = upper.indexOf('DEFAULT');
  if (defaultIdx !== -1) {
    const after = trimmed.slice(defaultIdx + 7).trim();
    if (/\bdatetime\s*\(\s*['"]now['"]\s*\)/i.test(after) || /\bCURRENT_TIMESTAMP\b/i.test(after)) {
      isNowDefault = true;
    } else {
      let v = after;
      if (v.startsWith('(') && v.endsWith(')')) v = v.slice(1, -1).trim();
      if (/^-?\d+$/.test(v)) {
        defaultValue = Number(v);
      } else if (/^(true|false)$/i.test(v)) {
        defaultValue = v.toLowerCase() === 'true';
      } else if (v.startsWith("'") && v.endsWith("'")) {
        defaultValue = v.slice(1, -1);
      } else {
        defaultValue = v;
      }
    }
  }

  return { name, type, primaryKey, autoincrement, notNull, defaultValue, isNowDefault };
}

function parseCreateTable(stmt: string, db: Database): void {
  const m = stmt.match(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*)\)$/i,
  );
  if (!m) {
    // Not a CREATE TABLE we understand — ignore silently (lenient, like real SQLite
    // accepting only what it can).
    return;
  }
  const tableName = m[1] as string;
  const body = m[2] as string;
  const colDefs = splitTopLevel(body, ',');
  const columns = colDefs.map((def) => parseColumnDef(def));
  if (!db.tables.has(tableName)) {
    db.tables.set(tableName, { name: tableName, columns, rows: [], nextAutoId: 1 });
  }
  // `IF NOT EXISTS` makes repeated calls a no-op once the table exists.
}

function execStatements(db: Database, sql: string): void {
  for (const stmt of splitStatements(sql)) {
    if (/^CREATE\s+TABLE\b/i.test(stmt)) {
      parseCreateTable(stmt, db);
    } else if (/^INSERT\b/i.test(stmt) || /^DELETE\b/i.test(stmt) || /^UPDATE\b/i.test(stmt)) {
      executeRun(db, stmt, []);
    } else if (/^SELECT\b/i.test(stmt)) {
      executeQuery(db, stmt, []);
    }
    // Unknown statements are ignored (lenient).
  }
}

// ---------------------------------------------------------------------------
// DML
// ---------------------------------------------------------------------------

function buildPredicate(
  where: string | undefined,
  nextParam: () => BindValue,
): (row: Row) => boolean {
  if (!where) return () => true;
  const conds = splitOnKeyword(where, 'AND');
  const checks: Array<(row: Row) => boolean> = [];
  for (const cond of conds) {
    const m = cond.match(/^(\w+)\s*=\s*\?$/);
    if (!m) {
      throw new Error(`[expo-sqlite mock] Unsupported WHERE condition: ${cond}`);
    }
    const col = m[1] as string;
    const val = nextParam();
    checks.push((row) => row[col] === val);
  }
  return (row) => checks.every((fn) => fn(row));
}

function doInsert(
  db: Database,
  sql: string,
  params: BindValue[],
  replace: boolean,
): RunResult {
  const m = sql.match(
    /^INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i,
  );
  if (!m) {
    throw new Error(`[expo-sqlite mock] Unsupported INSERT: ${sql}`);
  }
  const tableName = m[1] as string;
  const cols = splitTopLevel(m[2] as string, ',');
  const placeholders = splitTopLevel(m[3] as string, ',');
  const table = getTable(db, tableName);

  const row: Row = {};
  // Apply defaults / nulls for every column first.
  for (const col of table.columns) {
    if (col.isNowDefault) {
      row[col.name] = nowIso();
    } else if (col.defaultValue !== undefined) {
      row[col.name] = col.defaultValue;
    } else if (!col.notNull && !col.primaryKey) {
      row[col.name] = null;
    }
  }
  // Override with the values supplied in the INSERT.
  placeholders.forEach((_, i) => {
    const colName = cols[i];
    if (colName) {
      const v = params[i];
      row[colName] = v === undefined ? null : v;
    }
  });

  const pkCol = table.columns.find((c) => c.primaryKey);
  let lastInsertRowId = 0;
  if (pkCol) {
    if (pkCol.autoincrement && row[pkCol.name] == null) {
      row[pkCol.name] = table.nextAutoId;
    }
    if (typeof row[pkCol.name] === 'number') {
      lastInsertRowId = row[pkCol.name] as number;
      table.nextAutoId = Math.max(table.nextAutoId, lastInsertRowId + 1);
    }
    if (replace) {
      const pkVal = row[pkCol.name];
      table.rows = table.rows.filter((r) => r[pkCol.name] !== pkVal);
    }
  }

  table.rows.push(row);
  return { lastInsertRowId, changes: 1 };
}

function doDelete(db: Database, sql: string, params: BindValue[]): RunResult {
  const m = sql.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*))?$/i);
  if (!m) {
    throw new Error(`[expo-sqlite mock] Unsupported DELETE: ${sql}`);
  }
  const table = getTable(db, m[1] as string);
  const where = m[2] as string | undefined;
  let idx = 0;
  const predicate = buildPredicate(where, () => params[idx++] ?? null);
  const before = table.rows.length;
  table.rows = table.rows.filter((r) => !predicate(r));
  return { lastInsertRowId: 0, changes: before - table.rows.length };
}

function doUpdate(db: Database, sql: string, params: BindValue[]): RunResult {
  const m = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/i);
  if (!m) {
    throw new Error(`[expo-sqlite mock] Unsupported UPDATE: ${sql}`);
  }
  const table = getTable(db, m[1] as string);
  const setClause = m[2] as string;
  const where = m[3] as string | undefined;
  const setPairs = splitTopLevel(setClause, ',').map((p) => {
    const sm = p.match(/^(\w+)\s*=\s*\?$/);
    if (!sm) throw new Error(`[expo-sqlite mock] Unsupported SET assignment: ${p}`);
    return sm[1] as string;
  });
  let idx = 0;
  const newValues = setPairs.map(() => params[idx++] ?? null);
  const predicate = buildPredicate(where, () => params[idx++] ?? null);
  let changes = 0;
  for (const row of table.rows) {
    if (predicate(row)) {
      setPairs.forEach((col, i) => {
        row[col] = newValues[i];
      });
      changes++;
    }
  }
  return { lastInsertRowId: 0, changes };
}

function executeRun(db: Database, sql: string, params: BindValue[]): RunResult {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('INSERT OR REPLACE')) return doInsert(db, sql, params, true);
  if (upper.startsWith('INSERT')) return doInsert(db, sql, params, false);
  if (upper.startsWith('DELETE')) return doDelete(db, sql, params);
  if (upper.startsWith('UPDATE')) return doUpdate(db, sql, params);
  throw new Error(`[expo-sqlite mock] Unsupported statement: ${sql}`);
}

// ---------------------------------------------------------------------------
// SELECT
// ---------------------------------------------------------------------------

function compareValues(a: BindValue | undefined, b: BindValue | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function parseSelectTail(rest: string): {
  where: string | undefined;
  orderBy: string | undefined;
  limit: string | undefined;
} {
  const whereIdx = findKeyword(rest, 'WHERE');
  const orderByIdx = findKeyword(rest, 'ORDER BY');
  const limitIdx = findKeyword(rest, 'LIMIT');

  const present: Array<{ key: string; idx: number; len: number }> = [];
  if (whereIdx !== -1) present.push({ key: 'WHERE', idx: whereIdx, len: 5 });
  if (orderByIdx !== -1) present.push({ key: 'ORDER BY', idx: orderByIdx, len: 8 });
  if (limitIdx !== -1) present.push({ key: 'LIMIT', idx: limitIdx, len: 5 });
  present.sort((a, b) => a.idx - b.idx);

  const out = { where: undefined, orderBy: undefined, limit: undefined } as {
    where: string | undefined;
    orderBy: string | undefined;
    limit: string | undefined;
  };
  for (let i = 0; i < present.length; i++) {
    const start = present[i].idx + present[i].len;
    const end = i + 1 < present.length ? present[i + 1].idx : rest.length;
    const content = rest.slice(start, end).trim();
    if (present[i].key === 'WHERE') out.where = content;
    else if (present[i].key === 'ORDER BY') out.orderBy = content;
    else if (present[i].key === 'LIMIT') out.limit = content;
  }
  return out;
}

function projectColumns(colsStr: string, rows: Row[]): Row[] {
  const cols = colsStr.trim();
  if (cols === '*') {
    return rows.map((r) => ({ ...r }));
  }
  const countMatch = cols.match(/^COUNT\s*\(\s*\*\s*\)\s+AS\s+(\w+)$/i);
  if (countMatch) {
    const alias = countMatch[1] as string;
    return [{ [alias]: rows.length }];
  }
  const colNames = splitTopLevel(cols, ',');
  return rows.map((r) => {
    const out: Row = {};
    for (const c of colNames) {
      out[c] = r[c];
    }
    return out;
  });
}

function executeQuery(db: Database, sql: string, params: BindValue[]): Row[] {
  let rest = sql.trim().replace(/^SELECT\s+/i, '');
  const fromIdx = findKeyword(rest, 'FROM');
  if (fromIdx === -1) {
    throw new Error(`[expo-sqlite mock] Expected FROM in: ${sql}`);
  }
  const colsStr = rest.slice(0, fromIdx).trim();
  rest = rest.slice(fromIdx + 4).trim();
  const tableMatch = rest.match(/^(\w+)/);
  if (!tableMatch) {
    throw new Error(`[expo-sqlite mock] Expected table name in: ${sql}`);
  }
  const tableName = tableMatch[1] as string;
  rest = rest.slice(tableMatch[0].length).trim();

  const table = getTable(db, tableName);
  let rows = table.rows.map((r) => ({ ...r }));

  const { where, orderBy, limit } = parseSelectTail(rest);

  let idx = 0;
  if (where) {
    const predicate = buildPredicate(where, () => params[idx++] ?? null);
    rows = rows.filter(predicate);
  }

  if (orderBy) {
    const specs = splitTopLevel(orderBy, ',').map((spec) => {
      const parts = spec.trim().split(/\s+/);
      const col = parts[0] as string;
      const dir = (parts[1] ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      return { col, dir };
    });
    rows.sort((a, b) => {
      for (const { col, dir } of specs) {
        const cmp = compareValues(a[col], b[col]);
        if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  if (limit !== undefined) {
    let lim: number;
    if (limit === '?') {
      lim = (params[idx++] ?? 0) as number;
    } else {
      lim = Number(limit);
    }
    rows = rows.slice(0, lim);
  }

  return projectColumns(colsStr, rows);
}

// ---------------------------------------------------------------------------
// Transactions (snapshot / rollback)
// ---------------------------------------------------------------------------

function snapshotDb(db: Database): Map<string, { rows: Row[]; nextAutoId: number }> {
  const snap = new Map<string, { rows: Row[]; nextAutoId: number }>();
  for (const [name, t] of db.tables) {
    snap.set(name, { rows: t.rows.map((r) => ({ ...r })), nextAutoId: t.nextAutoId });
  }
  return snap;
}

function restoreDb(db: Database, snap: Map<string, { rows: Row[]; nextAutoId: number }>): void {
  for (const [name, t] of db.tables) {
    const s = snap.get(name);
    if (s) {
      t.rows = s.rows.map((r) => ({ ...r }));
      t.nextAutoId = s.nextAutoId;
    }
  }
}

// ---------------------------------------------------------------------------
// Public mock API
// ---------------------------------------------------------------------------

function createSQLiteDatabase(databaseName: string): SQLiteDatabaseMock {
  const db = getDatabase(databaseName);
  return {
    databasePath: databaseName,
    execSync(sql: string): void {
      execStatements(db, sql);
    },
    runSync<T = Row>(sql: string, ...rest: unknown[]): RunResult & { firstRowValues?: unknown } {
      const params = normalizeRest(rest);
      const result = executeRun(db, sql, params);
      return result as RunResult & { firstRowValues?: unknown } & T;
    },
    getFirstSync<T = Row>(sql: string, ...rest: unknown[]): T | null {
      const params = normalizeRest(rest);
      const rows = executeQuery(db, sql, params);
      return (rows.length > 0 ? (rows[0] as T) : null);
    },
    getAllSync<T = Row>(sql: string, ...rest: unknown[]): T[] {
      const params = normalizeRest(rest);
      const rows = executeQuery(db, sql, params);
      return rows as T[];
    },
    withTransactionSync(task: () => void): void {
      const snap = snapshotDb(db);
      try {
        task();
      } catch (e) {
        restoreDb(db, snap);
        throw e;
      }
    },
    closeSync(): void {
      // No-op: keep in-memory data so re-opening the same name sees the same state.
    },
    isInTransactionSync(): boolean {
      return false;
    },
  };
}

/**
 * Open a (mocked) database by name. Re-opening the same name returns a fresh
 * handle that shares the same underlying in-memory tables.
 */
export function openDatabaseSync(databaseName: string): SQLiteDatabaseMock {
  return createSQLiteDatabase(databaseName);
}

// Re-export some symbols that real `expo-sqlite` exposes, for compatibility.
export const defaultDatabaseDirectory = undefined;
