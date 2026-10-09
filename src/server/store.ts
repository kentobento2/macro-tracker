// Data access for the MCP server. The server uses Supabase's secret key (needed for API-token users), which
// bypasses row-level security, so isolation is enforced here instead: a store is created for exactly one
// user from the authenticated request, and every query it runs is filtered by that user's id.
// Tools never receive or pass user ids.

import type { SupabaseClient } from '@supabase/supabase-js';

import { type WeighIn } from '../lib/bodyweight';
import type { Database } from '../lib/database.types';
import type { DateKey } from '../lib/dates';
import type { FoodEntry } from '../lib/entries';
import type { CustomFood } from '../lib/custom-foods';
import type { Favorite } from '../lib/favorites';
import {
  customFoodFromRow,
  customFoodToRow,
  entryFromRow,
  entryToRow,
  favoriteFromRow,
  profileFromRow,
  weighInFromRow,
  weighInToRow,
  type UnitSystem,
} from '../lib/rows';
import type { Targets } from '../lib/targets';
import { DEFAULT_TIME_ZONE, isValidTimeZone } from '../lib/tz';

export type Db = SupabaseClient<Database>;

export type UserSettings = { timezone: string; targets: Targets | null; unitSystem: UnitSystem };

export interface UserStore {
  readonly userId: string;
  settings(): Promise<UserSettings>;
  entriesBetween(from: DateKey, to: DateKey): Promise<FoodEntry[]>;
  getEntry(id: string): Promise<FoodEntry | null>;
  insertEntries(entries: readonly FoodEntry[]): Promise<void>;
  /** Replaces an existing entry; false if it isn't this user's. */
  replaceEntry(entry: FoodEntry): Promise<boolean>;
  /** False if no such entry belongs to this user. */
  deleteEntry(id: string): Promise<boolean>;
  favorites(): Promise<Favorite[]>;
  customFoods(): Promise<CustomFood[]>;
  insertCustomFood(food: CustomFood): Promise<void>;
  /** Replaces one of this user's custom foods; false if it isn't theirs. */
  updateCustomFood(food: CustomFood): Promise<boolean>;
  saveWeight(w: WeighIn): Promise<void>;
  weightsBetween(from: DateKey, to: DateKey): Promise<WeighIn[]>;
}

export class StoreError extends Error {}

const fail = (what: string, error: { message: string }): never => {
  throw new StoreError(`${what}: ${error.message}`);
};

export function createUserStore(db: Db, userId: string): UserStore {
  if (!userId) throw new StoreError('A store needs an authenticated user.');
  const entries = () => db.from('food_entries');

  return {
    userId,

    async settings() {
      const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) fail('Loading settings failed', error);
      if (!data) return { timezone: DEFAULT_TIME_ZONE, targets: null, unitSystem: 'imperial' };
      const profile = profileFromRow(data);
      return {
        timezone: isValidTimeZone(data.timezone) ? data.timezone : DEFAULT_TIME_ZONE,
        targets: profile.targets,
        unitSystem: profile.unitSystem,
      };
    },

    async entriesBetween(from, to) {
      const { data, error } = await entries()
        .select('*')
        .eq('user_id', userId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('created_at');
      if (error) fail('Loading entries failed', error);
      return (data ?? []).map(entryFromRow).filter((e): e is FoodEntry => e !== null);
    },

    async getEntry(id) {
      const { data, error } = await entries().select('*').eq('user_id', userId).eq('id', id).maybeSingle();
      if (error) fail('Loading the entry failed', error);
      return data ? entryFromRow(data) : null;
    },

    async insertEntries(list) {
      if (list.length === 0) return;
      const { error } = await entries().insert(list.map((e) => ({ ...entryToRow(e), user_id: userId })));
      if (error) fail('Saving entries failed', error);
    },

    async replaceEntry(entry) {
      const { id: _id, created_at: _created, ...patch } = entryToRow(entry);
      const { data, error } = await entries()
        .update(patch)
        .eq('user_id', userId)
        .eq('id', entry.id)
        .select('id');
      if (error) fail('Updating the entry failed', error);
      return (data ?? []).length === 1;
    },

    async deleteEntry(id) {
      const { data, error } = await entries().delete().eq('user_id', userId).eq('id', id).select('id');
      if (error) fail('Deleting the entry failed', error);
      return (data ?? []).length === 1;
    },

    async favorites() {
      const { data, error } = await db.from('favorite_foods').select('*').eq('user_id', userId);
      if (error) fail('Loading favorites failed', error);
      return (data ?? []).map(favoriteFromRow).filter((f): f is Favorite => f !== null);
    },

    async customFoods() {
      const { data, error } = await db.from('custom_foods').select('*').eq('user_id', userId);
      if (error) fail('Loading custom foods failed', error);
      return (data ?? []).map(customFoodFromRow).filter((f): f is CustomFood => f !== null);
    },

    async insertCustomFood(food) {
      const { error } = await db.from('custom_foods').insert(customFoodToRow(userId, food));
      if (error) fail('Saving the custom food failed', error);
    },

    async updateCustomFood(food) {
      const { id: _id, user_id: _user, ...patch } = customFoodToRow(userId, food);
      const { data, error } = await db
        .from('custom_foods')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', food.id)
        .select('id');
      if (error) fail('Updating the custom food failed', error);
      return (data ?? []).length === 1;
    },

    async saveWeight(w) {
      const { error } = await db
        .from('body_weights')
        .upsert(weighInToRow(userId, w), { onConflict: 'user_id,entry_date' });
      if (error) fail('Saving the weight failed', error);
    },

    async weightsBetween(from, to) {
      const { data, error } = await db
        .from('body_weights')
        .select('*')
        .eq('user_id', userId)
        .gte('entry_date', from)
        .lte('entry_date', to)
        .order('entry_date');
      if (error) fail('Loading weights failed', error);
      return (data ?? []).map(weighInFromRow).filter((w): w is WeighIn => w !== null);
    },
  };
}
