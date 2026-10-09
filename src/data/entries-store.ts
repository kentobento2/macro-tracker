// Offline-first store for one user's food entries.
// Local changes go into a persisted queue and show immediately; the queue drains to Supabase when online.

import { addDays, type DateKey } from '@/lib/dates';
import type { FoodEntry } from '@/lib/entries';
import { entryFromRow, entryToRow } from '@/lib/rows';
import { supabase } from '@/lib/supabase';
import {
  applyConfirmed,
  enqueue,
  pruneCache,
  removeOp,
  replaceDays,
  type EntryCache,
  type PendingOp,
} from '@/lib/sync';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

const CACHE_DAYS = 60;

export type EntriesState = {
  ready: boolean;
  cache: EntryCache;
  queue: PendingOp[];
  /** Last sync failure the user should know about (server rejected a change). */
  syncError: string | null;
};

export class EntriesStore {
  private state: EntriesState = { ready: false, cache: {}, queue: [], syncError: null };
  private listeners = new Set<() => void>();
  private flushing = false;
  private confirmedVersion = 0;
  private readonly cacheKey: string;
  private readonly queueKey: string;

  constructor(private readonly today: () => DateKey, userId: string) {
    this.cacheKey = `${userKeyPrefix(userId)}entries`;
    this.queueKey = `${userKeyPrefix(userId)}queue`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<EntriesState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    const keepFrom = addDays(this.today(), -CACHE_DAYS);
    void writeJSON(this.cacheKey, pruneCache(this.state.cache, keepFrom));
    void writeJSON(this.queueKey, this.state.queue);
  }

  async init() {
    const [cache, queue] = await Promise.all([
      readJSON<EntryCache>(this.cacheKey, {}),
      readJSON<PendingOp[]>(this.queueKey, []),
    ]);
    this.set({ ready: true, cache, queue });
    void this.flush();
  }

  /** Fetch these days from the server and replace them in the cache. Silently keeps the cache if offline. */
  async refresh(dates: readonly DateKey[]): Promise<void> {
    if (dates.length === 0) return;
    const sorted = [...dates].sort();
    const versionAtStart = this.confirmedVersion;
    const { data, error } = await supabase
      .from('food_entries')
      .select('*')
      .gte('entry_date', sorted[0])
      .lte('entry_date', sorted[sorted.length - 1]);
    if (error) return;
    // A change was confirmed mid-request; this response may predate it. Try again.
    if (versionAtStart !== this.confirmedVersion) return this.refresh(dates);
    const entries = data.map(entryFromRow).filter((e): e is FoodEntry => e !== null);
    this.set({ cache: replaceDays(this.state.cache, sorted, entries) });
    this.persist();
  }

  save(entry: FoodEntry) {
    this.mutate({ kind: 'upsert', entry });
  }

  remove(id: string) {
    this.mutate({ kind: 'delete', id });
  }

  private mutate(op: PendingOp) {
    this.set({ queue: enqueue(this.state.queue, op), syncError: null });
    this.persist();
    void this.flush();
  }

  /** Send queued changes in order. Stops at the first network failure and retries on the next trigger. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.state.queue.length > 0) {
        const op = this.state.queue[0];
        const result =
          op.kind === 'upsert'
            ? await supabase.from('food_entries').upsert(entryToRow(op.entry))
            : await supabase.from('food_entries').delete().eq('id', op.id);

        if (isRetryable(result)) return;
        const { error } = result;

        // Read the queue fresh: the user may have edited this entry while the request was in flight,
        // in which case `op` was replaced and must stay queued.
        const queue = removeOp(this.state.queue, op);
        if (error) {
          console.warn('Dropping rejected change', error);
          this.set({ queue, syncError: "A change couldn't be saved and was discarded." });
        } else {
          this.confirmedVersion += 1;
          this.set({ queue, cache: applyConfirmed(this.state.cache, op) });
        }
        this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }
}
