// Offline-first store for one user's recipes (small list, cached in full).
// Local changes go into a persisted queue (one op per recipe) and sync to Supabase when online.

import { applyRecipeOps, enqueueRecipeOp, type Recipe, type RecipeOp } from '@/lib/recipes';
import { recipeFromRow, recipeToRow } from '@/lib/rows';
import { supabase } from '@/lib/supabase';

import { isRetryable } from './errors';
import { readJSON, userKeyPrefix, writeJSON } from './storage';

export type RecipesState = {
  ready: boolean;
  list: Recipe[];
  queue: RecipeOp[];
  /** Server list with pending changes applied, sorted by name. */
  view: Recipe[];
  syncError: string | null;
};

export class RecipesStore {
  private state: RecipesState = { ready: false, list: [], queue: [], view: [], syncError: null };
  private listeners = new Set<() => void>();
  private flushing = false;
  private confirmedVersion = 0;
  private readonly listKey: string;
  private readonly queueKey: string;

  constructor(private readonly userId: string) {
    this.listKey = `${userKeyPrefix(userId)}recipes`;
    this.queueKey = `${userKeyPrefix(userId)}recipes-queue`;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<Omit<RecipesState, 'view'>>) {
    const next = { ...this.state, ...patch };
    this.state = { ...next, view: applyRecipeOps(next.list, next.queue) };
    this.listeners.forEach((fn) => fn());
  }

  private persist() {
    void writeJSON(this.listKey, this.state.list);
    void writeJSON(this.queueKey, this.state.queue);
  }

  async init() {
    const [list, queue] = await Promise.all([readJSON<Recipe[]>(this.listKey, []), readJSON<RecipeOp[]>(this.queueKey, [])]);
    this.set({ ready: true, list, queue });
    void this.flush();
  }

  async refresh(): Promise<void> {
    const versionAtStart = this.confirmedVersion;
    const { data, error } = await supabase.from('recipes').select('*');
    if (error) return;
    if (versionAtStart !== this.confirmedVersion) return this.refresh();
    this.set({ list: data.map(recipeFromRow).filter((r): r is Recipe => r !== null) });
    this.persist();
  }

  save(recipe: Recipe) {
    this.mutate({ kind: 'upsert', recipe });
  }

  remove(id: string) {
    this.mutate({ kind: 'delete', id });
  }

  private mutate(op: RecipeOp) {
    this.set({ queue: enqueueRecipeOp(this.state.queue, op), syncError: null });
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
            ? await supabase.from('recipes').upsert(recipeToRow(this.userId, op.recipe), { onConflict: 'id' })
            : await supabase.from('recipes').delete().eq('id', op.id);
        if (isRetryable(result)) return;

        // Keep a newer op for the same recipe if the user changed it while the request was in flight.
        const queue = this.state.queue.filter((q) => q !== op);
        if (result.error) {
          console.warn('Dropping rejected recipe change', result.error);
          this.set({ queue, syncError: "A recipe couldn't be saved and was discarded." });
        } else {
          this.confirmedVersion += 1;
          this.set({ queue, list: applyRecipeOps(this.state.list, [op]) });
        }
        this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }
}
