// Food lookup for the MCP server: the user's saved foods first, then USDA, then Open Food Facts.
// Upstream calls are the shared module the app's Edge Function uses; parsing is the app's src/lib/foods.ts.

import {
  offProduct,
  searchOff,
  searchUsda,
  usdaFoodById,
  UpstreamError,
  type FoodSourceConfig,
} from '../../supabase/functions/_shared/food-sources';
import { customFoodToItem, type CustomFood } from '../lib/custom-foods';
import { addDays, type DateKey } from '../lib/dates';
import { recentFoods } from '../lib/entries';
import { dedupeFoods, foodKey, normalizeOffProduct, normalizeUsdaFood, type FoodItem } from '../lib/foods';
import type { Favorite } from '../lib/favorites';
import type { UserStore } from './store';

export type MatchSource = 'saved' | 'usda' | 'off';

export const SOURCE_LABELS: Record<MatchSource, string> = {
  saved: 'Saved (your custom foods, favorites and recent foods)',
  usda: 'USDA FoodData Central',
  off: 'Open Food Facts (community data)',
};

export type SavedFoods = {
  customFoods: CustomFood[];
  favorites: Favorite[];
  /** Distinct foods from recent logs, newest first, with the last entry for each. */
  recent: ReturnType<typeof recentFoods>;
  /** Every saved food by foodKey: a custom food's current definition wins, then favorites, then recent snapshots. */
  byKey: Map<string, FoodItem>;
};

/** Custom foods, favorites, and foods logged in the last 90 days. */
export async function loadSavedFoods(store: UserStore, today: DateKey): Promise<SavedFoods> {
  const [customFoods, favorites, entries] = await Promise.all([
    store.customFoods(),
    store.favorites(),
    store.entriesBetween(addDays(today, -90), today),
  ]);
  const recent = recentFoods(entries, 200);
  const byKey = new Map<string, FoodItem>();
  for (const r of recent) byKey.set(foodKey(r.food), r.food);
  for (const f of favorites) byKey.set(f.key, f.food);
  for (const c of customFoods) {
    const item = customFoodToItem(c);
    byKey.set(foodKey(item), item);
  }
  return { customFoods, favorites, recent, byKey };
}

export type ExternalResults = { usda: FoodItem[]; off: FoodItem[]; problems: string[] };

export interface FoodLookup {
  /** USDA (whole foods first, then branded) and, if asked, Open Food Facts. Never throws for upstream outages. */
  searchExternal(query: string, opts?: { includeOff?: boolean }): Promise<ExternalResults>;
  searchOff(query: string): Promise<{ foods: FoodItem[]; problem?: string }>;
  /** Full record for a food_ref ("usda:123", "off:0123…"), or null if it doesn't exist upstream. */
  fetchByRef(ref: string): Promise<FoodItem | null>;
}

const describeProblem = (source: string, e: unknown) =>
  e instanceof UpstreamError && e.busy
    ? `${source} is busy right now (rate limited); try again in a minute.`
    : `${source} could not be reached.`;

export function createFoodLookup(cfg: FoodSourceConfig): FoodLookup {
  const normalizeUsda = (list: Parameters<typeof normalizeUsdaFood>[0][]) =>
    list.map(normalizeUsdaFood).filter((f): f is FoodItem => f !== null);

  const lookup: FoodLookup = {
    async searchOff(query) {
      try {
        const products = await searchOff(cfg, query);
        const foods = products.flatMap((p) => {
          const f = p.code ? normalizeOffProduct(p, p.code) : null;
          return f ? [f] : [];
        });
        return { foods: dedupeFoods(foods) };
      } catch (e) {
        return { foods: [], problem: describeProblem('Open Food Facts', e) };
      }
    },

    async searchExternal(query, opts = {}) {
      const problems: string[] = [];
      let usda: FoodItem[] = [];
      try {
        const { foods, branded } = await searchUsda(cfg, query);
        usda = dedupeFoods([...normalizeUsda(foods), ...normalizeUsda(branded)]);
      } catch (e) {
        problems.push(describeProblem('USDA', e));
      }
      let off: FoodItem[] = [];
      if (opts.includeOff) {
        const r = await lookup.searchOff(query);
        off = r.foods;
        if (r.problem) problems.push(r.problem);
      }
      return { usda, off, problems };
    },

    async fetchByRef(ref) {
      const [source, id] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
      if (source === 'usda' && /^\d{1,10}$/.test(id)) {
        const f = await usdaFoodById(cfg, Number(id));
        return f ? normalizeUsdaFood(f) : null;
      }
      if (source === 'off' && /^\d{8,14}$/.test(id)) {
        const p = await offProduct(cfg, id);
        return p ? normalizeOffProduct(p, id) : null;
      }
      return null;
    },
  };
  return lookup;
}

/** Resolve a food_ref: saved snapshot first (so it matches what the user logged before), then upstream. */
export async function resolveFoodRef(ref: string, saved: SavedFoods, foods: FoodLookup): Promise<FoodItem | null> {
  return saved.byKey.get(ref) ?? (await foods.fetchByRef(ref));
}
