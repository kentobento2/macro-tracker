// Offline-first store for one user's custom foods (small list, cached in full).
// Local changes go into a persisted queue (one op per food) and sync to Supabase when online.

import { applyCustomFoodOps, enqueueCustomFoodOp, type CustomFood, type CustomFoodOp } from '@/lib/custom-foods';
import { customFoodFromRow, customFoodToRow } from '@/lib/rows';
import { supabase } from '@/lib/supabase';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

export type CustomFoodsState = {
  ready: boolean;
  list: CustomFood[];
  queue: CustomFoodOp[];
  /** Server list with pending changes applied, sorted by name. */
  view: CustomFood[];
  syncError: string | null;
};

export class CustomFoodsStore {
  private state: CustomFoodsState = { ready: false, list: [], queue: [], view: [], syncError: null };
  private listeners = new Set<() => void>();
  private flushing = false;
  private confirmedVersion = 0;
  private readonly listKey: string;
  private readonly queueKey: string;

  constructor(private readonly userId: string) {
    this.listKey = `${userKeyPrefix(userId)}custom-foods`;
    this.queueKey = `${userKeyPrefix(userId)}custom-foods-queue`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<Omit<CustomFoodsState, 'view'>>) {
    const next = { ...this.state, ...patch };
    this.state = { ...next, view: applyCustomFoodOps(next.list, next.queue) };
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    void writeJSON(this.listKey, this.state.list);
    void writeJSON(this.queueKey, this.state.queue);
  }

  async init() {
    const [list, queue] = await Promise.all([
      readJSON<CustomFood[]>(this.listKey, []),
      readJSON<CustomFoodOp[]>(this.queueKey, []),
    ]);
    this.set({ ready: true, list, queue });
    void this.flush();
  }

  async refresh(): Promise<void> {
    const versionAtStart = this.confirmedVersion;
    const { data, error } = await supabase.from('custom_foods').select('*');
    if (error) return;
    if (versionAtStart !== this.confirmedVersion) return this.refresh();
    this.set({ list: data.map(customFoodFromRow).filter((f): f is CustomFood => f !== null) });
    this.persist();
  }

  save(food: CustomFood) {
    this.mutate({ kind: 'upsert', food });
  }

  remove(id: string) {
    this.mutate({ kind: 'delete', id });
  }

  private mutate(op: CustomFoodOp) {
    this.set({ queue: enqueueCustomFoodOp(this.state.queue, op), syncError: null });
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
            ? await supabase.from('custom_foods').upsert(customFoodToRow(this.userId, op.food), { onConflict: 'id' })
            : await supabase.from('custom_foods').delete().eq('id', op.id);
        if (isRetryable(result)) return;

        // Keep a newer op for the same food if the user changed it while the request was in flight.
        const queue = this.state.queue.filter((q) => q !== op);
        if (result.error) {
          console.warn('Dropping rejected custom food change', result.error);
          this.set({ queue, syncError: "A custom food couldn't be saved and was discarded." });
        } else {
          this.confirmedVersion += 1;
          this.set({ queue, list: applyCustomFoodOps(this.state.list, [op]) });
        }
        this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }
}
