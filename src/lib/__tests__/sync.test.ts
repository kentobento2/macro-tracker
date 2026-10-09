import type { FoodEntry } from '../entries';
import {
  applyConfirmed,
  datesWithEntries,
  enqueue,
  findEntry,
  isDayLoaded,
  pruneCache,
  removeOp,
  replaceDays,
  viewDay,
  type EntryCache,
  type PendingOp,
} from '../sync';

const e = (id: string, date: string, createdAt: string, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id,
  date,
  meal: 'lunch',
  foodName: id,
  brand: null,
  source: 'custom',
  sourceId: null,
  quantity: 100,
  unit: 'g',
  serving: null,
  servings: [],
  grams: 100,
  per100g: { calories: 100, protein: 1, carbs: 1, fat: 1 },
  createdAt,
  ...extra,
});

const a = e('a', '2026-10-08', '2026-10-08T08:00:00Z');
const b = e('b', '2026-10-08', '2026-10-08T12:00:00Z');
const c = e('c', '2026-10-07', '2026-10-07T12:00:00Z');

describe('enqueue', () => {
  it('keeps only the latest op per entry', () => {
    let q: PendingOp[] = [];
    q = enqueue(q, { kind: 'upsert', entry: a });
    q = enqueue(q, { kind: 'upsert', entry: b });
    q = enqueue(q, { kind: 'delete', id: 'a' });
    expect(q).toEqual([{ kind: 'upsert', entry: b }, { kind: 'delete', id: 'a' }]);
  });

  it('removeOp removes by identity', () => {
    const op: PendingOp = { kind: 'upsert', entry: a };
    expect(removeOp([op], op)).toEqual([]);
  });
});

describe('viewDay', () => {
  const cache: EntryCache = { '2026-10-08': [a, b], '2026-10-07': [c] };

  it('returns cached rows when nothing is pending', () => {
    expect(viewDay(cache, [], '2026-10-08')).toEqual([a, b]);
  });

  it('applies pending upserts, edits, and deletes', () => {
    const edited = { ...a, quantity: 50, grams: 50 };
    const added = e('d', '2026-10-08', '2026-10-08T10:00:00Z');
    const q: PendingOp[] = [
      { kind: 'upsert', entry: edited },
      { kind: 'delete', id: 'b' },
      { kind: 'upsert', entry: added },
    ];
    expect(viewDay(cache, q, '2026-10-08')).toEqual([edited, added]);
  });

  it('moves an entry whose date changed', () => {
    const moved = { ...c, date: '2026-10-08' };
    const q: PendingOp[] = [{ kind: 'upsert', entry: moved }];
    expect(viewDay(cache, q, '2026-10-07')).toEqual([]);
    expect(viewDay(cache, q, '2026-10-08').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('findEntry', () => {
  it('prefers the queue and respects pending deletes', () => {
    const cache: EntryCache = { '2026-10-08': [a] };
    const edited = { ...a, quantity: 5 };
    expect(findEntry(cache, [], 'a')).toBe(a);
    expect(findEntry(cache, [{ kind: 'upsert', entry: edited }], 'a')).toBe(edited);
    expect(findEntry(cache, [{ kind: 'delete', id: 'a' }], 'a')).toBeNull();
    expect(findEntry(cache, [], 'zzz')).toBeNull();
  });
});

describe('applyConfirmed', () => {
  it('upserts into the right day and removes from the old one', () => {
    const moved = { ...c, date: '2026-10-08' };
    const next = applyConfirmed({ '2026-10-08': [a, b], '2026-10-07': [c] }, { kind: 'upsert', entry: moved });
    expect(next['2026-10-07']).toEqual([]);
    expect(next['2026-10-08'].map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('removes deleted entries', () => {
    expect(applyConfirmed({ '2026-10-08': [a, b] }, { kind: 'delete', id: 'a' })).toEqual({ '2026-10-08': [b] });
  });
});

describe('replaceDays', () => {
  it('overwrites requested days, including empty ones, and leaves others', () => {
    const next = replaceDays({ '2026-10-08': [a], '2026-10-01': [c] }, ['2026-10-07', '2026-10-08'], [b]);
    expect(next).toEqual({ '2026-10-08': [b], '2026-10-07': [], '2026-10-01': [c] });
  });
});

describe('pruneCache', () => {
  it('drops days before the cutoff', () => {
    expect(pruneCache({ '2026-08-01': [c], '2026-10-08': [a] }, '2026-09-01')).toEqual({ '2026-10-08': [a] });
  });
});

describe('isDayLoaded', () => {
  it('distinguishes an empty loaded day from an unloaded one', () => {
    const cache = replaceDays({}, ['2026-10-07'], []);
    expect(isDayLoaded(cache, '2026-10-07')).toBe(true);
    expect(viewDay(cache, [], '2026-10-07')).toEqual([]);
    expect(isDayLoaded(cache, '2026-10-06')).toBe(false);
  });

  it('pruning the device cache only makes old days unloaded (re-fetched), never deleted on the server', () => {
    const old = e('old', '2025-01-15', '2025-01-15T12:00:00Z');
    const loaded = replaceDays({}, ['2025-01-15'], [old]);
    expect(viewDay(loaded, [], '2025-01-15')).toEqual([old]);
    const pruned = pruneCache(loaded, '2026-08-09');
    expect(isDayLoaded(pruned, '2025-01-15')).toBe(false);
    // Fetching it again (what the app does when you open that day online) restores it.
    expect(viewDay(replaceDays(pruned, ['2025-01-15'], [old]), [], '2025-01-15')).toEqual([old]);
  });
});

describe('datesWithEntries', () => {
  const days = ['2026-10-06', '2026-10-07', '2026-10-08'];

  it('uses the server list for days not on the device', () => {
    expect([...datesWithEntries(days, {}, [], new Set(['2026-10-06']))]).toEqual(['2026-10-06']);
  });

  it('trusts the device for loaded days, including unsynced deletes', () => {
    const cache: EntryCache = { '2026-10-08': [a] };
    const q: PendingOp[] = [{ kind: 'delete', id: 'a' }];
    // Server still says 10-08 has entries, but the local delete wins.
    expect(datesWithEntries(days, cache, q, new Set(['2026-10-08'])).has('2026-10-08')).toBe(false);
  });

  it('shows unsynced adds immediately, even offline', () => {
    const added = e('n', '2026-10-07', '2026-10-07T09:00:00Z');
    const result = datesWithEntries(days, {}, [{ kind: 'upsert', entry: added }], null);
    expect([...result]).toEqual(['2026-10-07']);
  });

  it('marks a loaded empty day as not logged even if the server list is stale', () => {
    const cache = replaceDays({}, ['2026-10-06'], []);
    expect(datesWithEntries(days, cache, [], new Set(['2026-10-06'])).size).toBe(0);
  });
});
