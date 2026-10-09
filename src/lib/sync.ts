// Offline-first bookkeeping for food entries. Pure: no storage or network here.
//
// - `cache` holds the last server-confirmed entries per day.
// - `queue` holds local changes not yet confirmed by the server.
// - What the UI shows is cache + queue applied on top.

import type { DateKey } from './dates';
import type { FoodEntry } from './entries';

export type PendingOp = { kind: 'upsert'; entry: FoodEntry } | { kind: 'delete'; id: string };

export type EntryCache = Record<DateKey, FoodEntry[]>;

const opId = (op: PendingOp) => (op.kind === 'upsert' ? op.entry.id : op.id);

/** Add an op, dropping any earlier pending op for the same entry (last write wins). */
export function enqueue(queue: readonly PendingOp[], op: PendingOp): PendingOp[] {
  const id = opId(op);
  return [...queue.filter((q) => opId(q) !== id), op];
}

export function removeOp(queue: readonly PendingOp[], op: PendingOp): PendingOp[] {
  return queue.filter((q) => q !== op);
}

const byCreated = (a: FoodEntry, b: FoodEntry) => a.createdAt.localeCompare(b.createdAt);

/** Entries for one day as the user should see them: cached rows with pending changes applied. */
export function viewDay(cache: EntryCache, queue: readonly PendingOp[], date: DateKey): FoodEntry[] {
  const pendingIds = new Set(queue.map(opId));
  const base = (cache[date] ?? []).filter((e) => !pendingIds.has(e.id));
  const added = queue.flatMap((op) => (op.kind === 'upsert' && op.entry.date === date ? [op.entry] : []));
  return [...base, ...added].sort(byCreated);
}

/** Look up an entry by id across cache and queue (queue wins). */
export function findEntry(cache: EntryCache, queue: readonly PendingOp[], id: string): FoodEntry | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const op = queue[i];
    if (opId(op) === id) return op.kind === 'upsert' ? op.entry : null;
  }
  for (const day of Object.values(cache)) {
    const hit = day.find((e) => e.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Fold a server-confirmed op into the cache. */
export function applyConfirmed(cache: EntryCache, op: PendingOp): EntryCache {
  const id = opId(op);
  const next: EntryCache = {};
  for (const [date, entries] of Object.entries(cache)) {
    next[date] = entries.filter((e) => e.id !== id);
  }
  if (op.kind === 'upsert') {
    next[op.entry.date] = [...(next[op.entry.date] ?? []), op.entry].sort(byCreated);
  }
  return next;
}

/** Replace cached days with fresh server results. Every day in `dates` is overwritten, even if empty. */
export function replaceDays(cache: EntryCache, dates: readonly DateKey[], serverEntries: readonly FoodEntry[]): EntryCache {
  const next: EntryCache = { ...cache };
  for (const d of dates) next[d] = [];
  for (const e of serverEntries) {
    if (next[e.date]) next[e.date].push(e);
  }
  for (const d of dates) next[d].sort(byCreated);
  return next;
}

/** Drop cached days older than `keepFrom` to bound storage. */
export function pruneCache(cache: EntryCache, keepFrom: DateKey): EntryCache {
  return Object.fromEntries(Object.entries(cache).filter(([d]) => d >= keepFrom));
}

/**
 * Whether the server's entries for `date` are in the device cache. A loaded day with no entries
 * means "nothing logged"; an unloaded day means "unknown" (e.g. older than the cache window and offline).
 */
export function isDayLoaded(cache: EntryCache, date: DateKey): boolean {
  return Object.prototype.hasOwnProperty.call(cache, date);
}
