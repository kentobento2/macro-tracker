// Offline-first store for one user's favorite foods (small list, cached in full).
// Local changes go into a persisted queue (one op per food) and sync to Supabase when online.

import { applyFavoriteOps, enqueueFavoriteOp, type Favorite, type FavoriteOp } from '@/lib/favorites';
import { favoriteFromRow, favoriteToRow } from '@/lib/rows';
import { supabase } from '@/lib/supabase';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

export type FavoritesState = {
  ready: boolean;
  list: Favorite[];
  queue: FavoriteOp[];
  /** Server list with pending changes applied, newest first. */
  view: Favorite[];
  syncError: string | null;
};

export class FavoritesStore {
  private state: FavoritesState = { ready: false, list: [], queue: [], view: [], syncError: null };
  private listeners = new Set<() => void>();
  private flushing = false;
  private confirmedVersion = 0;
  private readonly listKey: string;
  private readonly queueKey: string;

  constructor(private readonly userId: string) {
    this.listKey = `${userKeyPrefix(userId)}favorites`;
    this.queueKey = `${userKeyPrefix(userId)}favorites-queue`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<Omit<FavoritesState, 'view'>>) {
    const next = { ...this.state, ...patch };
    this.state = { ...next, view: applyFavoriteOps(next.list, next.queue) };
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    void writeJSON(this.listKey, this.state.list);
    void writeJSON(this.queueKey, this.state.queue);
  }

  async init() {
    const [list, queue] = await Promise.all([
      readJSON<Favorite[]>(this.listKey, []),
      readJSON<FavoriteOp[]>(this.queueKey, []),
    ]);
    this.set({ ready: true, list, queue });
    void this.flush();
  }

  async refresh(): Promise<void> {
    const versionAtStart = this.confirmedVersion;
    const { data, error } = await supabase.from('favorite_foods').select('*');
    if (error) return;
    if (versionAtStart !== this.confirmedVersion) return this.refresh();
    this.set({ list: data.map(favoriteFromRow).filter((f): f is Favorite => f !== null) });
    this.persist();
  }

  save(favorite: Favorite) {
    this.mutate({ kind: 'upsert', favorite });
  }

  remove(key: string) {
    this.mutate({ kind: 'delete', key });
  }

  private mutate(op: FavoriteOp) {
    this.set({ queue: enqueueFavoriteOp(this.state.queue, op), syncError: null });
    this.persist();
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.state.queue.length > 0) {
        const op = this.state.queue[0];
        const result =
          op.kind === 'upsert'
            ? await supabase
                .from('favorite_foods')
                .upsert(favoriteToRow(this.userId, op.favorite), { onConflict: 'user_id,food_key' })
            : await supabase.from('favorite_foods').delete().eq('food_key', op.key);
        if (isRetryable(result)) return;

        // Keep a newer op for the same food if the user changed it while the request was in flight.
        const queue = this.state.queue.filter((q) => q !== op);
        if (result.error) {
          console.warn('Dropping rejected favorite change', result.error);
          this.set({ queue, syncError: "A favorite couldn't be saved and was discarded." });
        } else {
          this.confirmedVersion += 1;
          this.set({ queue, list: applyFavoriteOps(this.state.list, [op]) });
        }
        this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }
}
