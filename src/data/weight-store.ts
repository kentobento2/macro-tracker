// Offline-first store for one user's weigh-ins. The full history is small, so it's cached in full.
// Local changes go into a persisted queue (one op per day) and sync to Supabase when online.

import { applyWeightOps, enqueueWeightOp, type WeighIn, type WeightOp } from '@/lib/bodyweight';
import type { DateKey } from '@/lib/dates';
import { weighInFromRow, weighInToRow } from '@/lib/rows';
import { supabase } from '@/lib/supabase';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

export type WeightState = {
  ready: boolean;
  /** Last server-confirmed list. Use `view` for display. */
  list: WeighIn[];
  queue: WeightOp[];
  /** Server list with pending changes applied, sorted oldest first. */
  view: WeighIn[];
  syncError: string | null;
};

export class WeightStore {
  private state: WeightState = { ready: false, list: [], queue: [], view: [], syncError: null };
  private listeners = new Set<() => void>();
  private flushing = false;
  private confirmedVersion = 0;
  private readonly listKey: string;
  private readonly queueKey: string;

  constructor(private readonly userId: string) {
    this.listKey = `${userKeyPrefix(userId)}weights`;
    this.queueKey = `${userKeyPrefix(userId)}weight-queue`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<Omit<WeightState, 'view'>>) {
    const next = { ...this.state, ...patch };
    this.state = { ...next, view: applyWeightOps(next.list, next.queue) };
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    void writeJSON(this.listKey, this.state.list);
    void writeJSON(this.queueKey, this.state.queue);
  }

  async init() {
    const [list, queue] = await Promise.all([
      readJSON<WeighIn[]>(this.listKey, []),
      readJSON<WeightOp[]>(this.queueKey, []),
    ]);
    this.set({ ready: true, list, queue });
    void this.flush();
  }

  async refresh(): Promise<void> {
    const versionAtStart = this.confirmedVersion;
    const { data, error } = await supabase.from('body_weights').select('*').order('entry_date');
    if (error) return;
    if (versionAtStart !== this.confirmedVersion) return this.refresh();
    this.set({ list: data.map(weighInFromRow).filter((w): w is WeighIn => w !== null) });
    this.persist();
  }

  /** Save (or replace) the weigh-in for its day. */
  save(weighIn: WeighIn) {
    this.mutate({ kind: 'upsert', weighIn });
  }

  remove(date: DateKey) {
    this.mutate({ kind: 'delete', date });
  }

  private mutate(op: WeightOp) {
    this.set({ queue: enqueueWeightOp(this.state.queue, op), syncError: null });
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
                .from('body_weights')
                .upsert(weighInToRow(this.userId, op.weighIn), { onConflict: 'user_id,entry_date' })
            : await supabase.from('body_weights').delete().eq('entry_date', op.date);
        if (isRetryable(result)) return;

        // The user may have changed this day again while the request was in flight; keep the newer op.
        const queue = this.state.queue.filter((q) => q !== op);
        if (result.error) {
          console.warn('Dropping rejected weigh-in change', result.error);
          this.set({ queue, syncError: "A weight change couldn't be saved and was discarded." });
        } else {
          this.confirmedVersion += 1;
          this.set({ queue, list: applyWeightOps(this.state.list, [op]) });
        }
        this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }
}
