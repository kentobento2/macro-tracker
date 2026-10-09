// MCP tools for the macro tracker. Each tool gets a ToolContext bound to the authenticated user; none of them
// accepts a user id. All nutrition math comes from src/lib (the same code the app uses).

import { z } from 'zod';

import {
  parseWeightInput,
  rollingAverage,
  weekOverWeek,
  weeklyAverages,
  type WeighIn,
} from '../lib/bodyweight';
import { addDays, isDateKey, type DateKey } from '../lib/dates';
import {
  buildEntry,
  entryNutrition,
  foodFromEntry,
  MEALS,
  totalNutrition,
  totalsByMeal,
  type FoodEntry,
  type Meal,
  type Portion,
} from '../lib/entries';
import { formatPortion } from '../lib/format';
import { foodKey, type FoodItem } from '../lib/foods';
import { nutritionForGrams, remainingNutrition, type Nutrition } from '../lib/macros';
import { rankFoods, resolvePortion } from '../lib/meal-matching';
import { dateKeyInTimeZone } from '../lib/tz';
import { KG_PER_POUND } from '../lib/units';
import { loadSavedFoods, resolveFoodRef, SOURCE_LABELS, type FoodLookup, type MatchSource } from './foods';
import type { UserSettings, UserStore } from './store';

export type ToolContext = {
  store: UserStore;
  foods: FoodLookup;
  now: Date;
  newId: () => string;
};

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

type Annotations = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolDef<S extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  inputSchema: S;
  annotations: Annotations;
  run: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<ToolResult>;
};

const ok = (data: unknown): ToolResult => ({ ok: true, data });
const fail = (error: string): ToolResult => ({ ok: false, error });

const r1 = (n: number) => Math.round(n * 10) / 10;
const macros = (n: Nutrition) => ({
  calories: Math.round(n.calories),
  protein_g: r1(n.protein),
  carbs_g: r1(n.carbs),
  fat_g: r1(n.fat),
});

// ---------- shared input pieces ----------

const MEAL_INPUT = z
  .enum(['breakfast', 'lunch', 'dinner', 'snack'])
  .describe('Which meal: breakfast, lunch, dinner, or snack.');
const toMeal = (m: 'breakfast' | 'lunch' | 'dinner' | 'snack'): Meal => (m === 'snack' ? 'snacks' : m);

const DATE_INPUT = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe("Date as YYYY-MM-DD in the user's timezone. Omit for today.");

const QUANTITY = z.number().positive().max(100000).describe('Amount, e.g. 2 or 0.5.');
const UNIT = z
  .string()
  .min(1)
  .max(30)
  .describe(
    'Unit for the amount: g, oz, lb, kg, ml, cup, tbsp, tsp, slice, piece, serving, or a food word ' +
      'from the food\'s serving list such as "banana", "egg", or "bar".'
  );
const FOOD_REF = z
  .string()
  .min(3)
  .max(300)
  .describe('A food_ref returned by preview_meal, search_foods, or get_recent_foods (e.g. "usda:2709224").');
const ENTRY_ID = z.string().uuid().describe('An entry_id from get_daily_summary or log_meal.');

/** Today in the user's timezone, and validation of an optional date (no future dates). */
function resolveDate(input: string | undefined, settings: UserSettings, now: Date): { date: DateKey } | { error: string } {
  const today = dateKeyInTimeZone(now, settings.timezone);
  if (input === undefined) return { date: today };
  if (!isDateKey(input)) return { error: `"${input}" is not a valid date. Use YYYY-MM-DD.` };
  if (input > today) return { error: `${input} is in the future (today is ${today} in ${settings.timezone}).` };
  if (input < addDays(today, -730)) return { error: 'Dates more than two years back are not supported.' };
  return { date: input };
}

function describeEntry(e: FoodEntry) {
  return {
    entry_id: e.id,
    date: e.date,
    meal: e.meal === 'snacks' ? 'snack' : e.meal,
    food: e.foodName,
    brand: e.brand,
    food_ref: foodKey({ source: e.source, sourceId: e.sourceId, name: e.foodName }),
    portion: formatPortion(e),
    grams: r1(e.grams),
    ...macros(entryNutrition(e)),
  };
}

async function daySummary(store: UserStore, date: DateKey, settings: UserSettings) {
  const entries = await store.entriesBetween(date, date);
  const consumed = totalNutrition(entries);
  const byMeal = totalsByMeal(entries);
  const targets = settings.targets;
  return {
    date,
    timezone: settings.timezone,
    consumed: macros(consumed),
    targets: targets
      ? { calories: targets.calories, protein_g: targets.protein, carbs_g: targets.carbs, fat_g: targets.fat }
      : null,
    remaining: targets ? macros(remainingNutrition(targets, consumed)) : null,
    meals: Object.fromEntries(
      MEALS.map((m) => [
        m === 'snacks' ? 'snack' : m,
        {
          totals: macros(byMeal[m]),
          entries: entries.filter((e) => e.meal === m).map(describeEntry),
        },
      ])
    ),
    note: targets ? undefined : 'No daily targets set yet; the user can set them in the app under Settings.',
  };
}

function foodSummary(food: FoodItem, source: MatchSource) {
  return {
    food_ref: foodKey(food),
    name: food.name,
    brand: food.brand,
    source,
    source_label: SOURCE_LABELS[source],
    per_100g: macros(food.per100g),
    servings: food.servings.map((s) => ({ label: s.label, grams: r1(s.grams) })),
    calories_derived_from_macros: food.caloriesDerived || undefined,
  };
}

// ---------- preview_meal ----------

const previewMeal: ToolDef<{
  items: z.ZodArray<
    z.ZodObject<{ food_name: z.ZodString; quantity: typeof QUANTITY; unit: typeof UNIT; preparation: z.ZodOptional<z.ZodString> }>
  >;
}> = {
  name: 'preview_meal',
  description:
    'Look up the nutrition for a meal WITHOUT saving anything. Use this first whenever the user describes ' +
    'something they ate. Parse their description into separate items (one per food, with its amount and unit; ' +
    'e.g. "2 eggs and a slice of toast" -> [{food_name:"egg", quantity:2, unit:"egg"}, {food_name:"toast", ' +
    'quantity:1, unit:"slice"}]), call this tool, then show the user each match (name, source, portion, ' +
    'calories/protein/carbs/fat) and the total, and ask them to confirm or correct before calling log_meal. ' +
    "Matches come from the user's saved foods first, then USDA, then Open Food Facts. Items can come back as " +
    '"not_found" or "needs_unit"; ask the user about those instead of guessing numbers.',
  inputSchema: {
    items: z
      .array(
        z.object({
          food_name: z.string().min(1).max(100).describe('What the food is, e.g. "chicken breast" or "Chobani vanilla yogurt".'),
          quantity: QUANTITY,
          unit: UNIT,
          preparation: z.string().max(60).optional().describe('Optional, e.g. "grilled", "fried", "cooked".'),
        })
      )
      .min(1)
      .max(20)
      .describe('The foods in the meal, one entry per food.'),
  },
  annotations: { title: 'Preview a meal (no saving)', readOnlyHint: true, openWorldHint: true },
  async run({ items }, ctx) {
    const settings = await ctx.store.settings();
    const today = dateKeyInTimeZone(ctx.now, settings.timezone);
    const saved = await loadSavedFoods(ctx.store, today);
    const savedFoods = [...saved.byKey.values()];
    const problems = new Set<string>();

    const results = await Promise.all(
      items.map(async (item) => {
        const input = { food_name: item.food_name, quantity: item.quantity, unit: item.unit, preparation: item.preparation };
        const candidates: { food: FoodItem; source: MatchSource; score: number }[] = [];

        const savedRanked = rankFoods(item.food_name, savedFoods, item.preparation);
        candidates.push(...savedRanked.slice(0, 3).map((r) => ({ ...r, source: 'saved' as const })));
        let best = savedRanked[0]?.covered ? candidates[0] : undefined;

        if (!best) {
          const ext = await ctx.foods.searchExternal(item.food_name);
          ext.problems.forEach((p) => problems.add(p));
          const usdaRanked = rankFoods(item.food_name, ext.usda, item.preparation).map((r) => ({ ...r, source: 'usda' as const }));
          candidates.push(...usdaRanked.slice(0, 3));
          best = usdaRanked[0]?.covered ? usdaRanked[0] : undefined;
          if (!best) {
            const off = await ctx.foods.searchOff(item.food_name);
            if (off.problem) problems.add(off.problem);
            const offRanked = rankFoods(item.food_name, off.foods, item.preparation).map((r) => ({ ...r, source: 'off' as const }));
            candidates.push(...offRanked.slice(0, 3));
            best = offRanked[0]?.covered ? offRanked[0] : undefined;
          }
        }

        const alternatives = candidates
          .filter((c) => c !== best && c.score >= 0.4)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((c) => ({ food_ref: foodKey(c.food), name: c.food.name, brand: c.food.brand, source: c.source }));

        if (!best) {
          return {
            input,
            status: 'not_found' as const,
            message:
              `No confident match for "${item.food_name}" in the user's saved foods, USDA, or Open Food Facts. ` +
              (alternatives.length ? 'Offer the alternatives below, ' : '') +
              'or ask the user for a more specific name or an approximate breakdown.',
            alternatives,
          };
        }

        // Use the full record (all serving sizes) so the portion matches what log_meal will save.
        const ref = foodKey(best.food);
        const food = best.source === 'saved' ? best.food : ((await ctx.foods.fetchByRef(ref).catch(() => null)) ?? best.food);
        const portion = resolvePortion(food, item.quantity, item.unit);
        if (!portion.ok) {
          return {
            input,
            status: 'needs_unit' as const,
            food: foodSummary(food, best.source),
            message: portion.error,
            alternatives,
          };
        }
        return {
          input,
          status: 'matched' as const,
          food_ref: ref,
          matched_name: food.name,
          brand: food.brand,
          source: best.source,
          source_label: SOURCE_LABELS[best.source],
          portion: formatPortion({ ...portion.value.portion, serving: portion.value.portion.serving ?? null, grams: portion.value.grams }),
          quantity: item.quantity,
          unit: item.unit,
          grams: r1(portion.value.grams),
          ...macros(nutritionForGrams(food.per100g, portion.value.grams)),
          note: [portion.value.note, food.caloriesDerived ? 'Calories were calculated from the macros (4/4/9).' : null]
            .filter(Boolean)
            .join(' ') || undefined,
          alternatives,
        };
      })
    );

    const matched = results.filter((r) => r.status === 'matched');
    const total = matched.reduce(
      (t, r) => ({
        calories: t.calories + r.calories,
        protein_g: r1(t.protein_g + r.protein_g),
        carbs_g: r1(t.carbs_g + r.carbs_g),
        fat_g: r1(t.fat_g + r.fat_g),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
    return ok({
      saved: false,
      items: results,
      total_of_matched_items: total,
      unmatched_count: results.length - matched.length,
      data_source_problems: problems.size ? [...problems] : undefined,
      next_step:
        'Show these results to the user and get confirmation. Then call log_meal with each confirmed item\'s food_ref, quantity, and unit.',
    });
  },
};

// ---------- log_meal ----------

const logMeal: ToolDef<{
  items: z.ZodArray<z.ZodObject<{ food_ref: typeof FOOD_REF; quantity: typeof QUANTITY; unit: typeof UNIT }>>;
  meal: typeof MEAL_INPUT;
  date: typeof DATE_INPUT;
}> = {
  name: 'log_meal',
  description:
    "Save confirmed foods to the user's food log. Only call this after the user has confirmed the items " +
    'shown by preview_meal (or chosen foods from search_foods / get_recent_foods). Pass each item\'s food_ref ' +
    'with the quantity and unit the user confirmed. Nutrition is recalculated on the server from the food ' +
    "database, not taken from the conversation. Returns the saved entries and the user's updated daily totals. " +
    'Logged foods automatically appear in the user\'s recent foods.',
  inputSchema: {
    items: z
      .array(z.object({ food_ref: FOOD_REF, quantity: QUANTITY, unit: UNIT }))
      .min(1)
      .max(20)
      .describe('The confirmed items.'),
    meal: MEAL_INPUT,
    date: DATE_INPUT,
  },
  annotations: { title: 'Log a meal', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async run({ items, meal, date: dateInput }, ctx) {
    const settings = await ctx.store.settings();
    const d = resolveDate(dateInput, settings, ctx.now);
    if ('error' in d) return fail(d.error);
    const saved = await loadSavedFoods(ctx.store, dateKeyInTimeZone(ctx.now, settings.timezone));

    // Resolve everything before saving anything, so a bad item doesn't leave a half-logged meal.
    const built: FoodEntry[] = [];
    for (const [i, item] of items.entries()) {
      let food: FoodItem | null;
      try {
        food = await resolveFoodRef(item.food_ref, saved, ctx.foods);
      } catch {
        return fail(
          `Item ${i + 1}: the food database for "${item.food_ref}" couldn't be reached right now. Nothing was saved; try again in a minute.`
        );
      }
      if (!food) {
        return fail(
          `Item ${i + 1}: food_ref "${item.food_ref}" was not found. Run preview_meal or search_foods again to get a current food_ref. Nothing was saved.`
        );
      }
      const portion = resolvePortion(food, item.quantity, item.unit);
      if (!portion.ok) return fail(`Item ${i + 1} (${food.name}): ${portion.error} Nothing was saved.`);
      built.push(
        buildEntry({
          id: ctx.newId(),
          date: d.date,
          meal: toMeal(meal),
          food,
          portion: portion.value.portion,
          // Keep the meal's items in the order given.
          createdAt: new Date(ctx.now.getTime() + i).toISOString(),
        })
      );
    }
    await ctx.store.insertEntries(built);
    return ok({ saved: built.map(describeEntry), daily_summary: await daySummary(ctx.store, d.date, settings) });
  },
};

// ---------- search_foods ----------

const searchFoods: ToolDef<{ query: z.ZodString }> = {
  name: 'search_foods',
  description:
    "Search for a food by name: the user's saved foods (favorites and recently logged) first, then USDA " +
    '(whole foods and branded products), then Open Food Facts (community data, less reliable). Use when the ' +
    'user wants to pick a specific product, or preview_meal returned not_found. Each result has a food_ref ' +
    'for log_meal, nutrition per 100 g, and the serving sizes available as units.',
  inputSchema: { query: z.string().min(2).max(100).describe('Food name, optionally with brand, e.g. "fairlife chocolate milk".') },
  annotations: { title: 'Search foods', readOnlyHint: true, openWorldHint: true },
  async run({ query }, ctx) {
    const settings = await ctx.store.settings();
    const saved = await loadSavedFoods(ctx.store, dateKeyInTimeZone(ctx.now, settings.timezone));
    const savedMatches = rankFoods(query, [...saved.byKey.values()])
      .filter((r) => r.score >= 0.5)
      .slice(0, 5)
      .map((r) => foodSummary(r.food, 'saved'));
    const ext = await ctx.foods.searchExternal(query, { includeOff: true });
    const rankAndLimit = (list: FoodItem[], n: number) =>
      rankFoods(query, list)
        .filter((r) => r.score >= 0.4)
        .slice(0, n)
        .map((r) => r.food);
    return ok({
      saved: savedMatches,
      usda: rankAndLimit(ext.usda, 8).map((f) => foodSummary(f, 'usda')),
      open_food_facts: rankAndLimit(ext.off, 5).map((f) => foodSummary(f, 'off')),
      data_source_problems: ext.problems.length ? ext.problems : undefined,
    });
  },
};

// ---------- get_recent_foods ----------

const getRecentFoods: ToolDef<Record<string, never>> = {
  name: 'get_recent_foods',
  description:
    "Get the user's favorite foods (with their usual portions), recently logged foods, and their meals from " +
    'the last 7 days. Use this to resolve phrases like "my usual breakfast", "same as yesterday\'s lunch", or ' +
    '"my protein shake". Each item includes a food_ref and a quantity/unit that log_meal accepts as-is. ' +
    'Still confirm with the user before logging.',
  inputSchema: {},
  annotations: { title: 'Recent and favorite foods', readOnlyHint: true },
  async run(_args, ctx) {
    const settings = await ctx.store.settings();
    const today = dateKeyInTimeZone(ctx.now, settings.timezone);
    const saved = await loadSavedFoods(ctx.store, today);
    const week = await ctx.store.entriesBetween(addDays(today, -6), today);
    const asLoggable = (e: FoodEntry) => ({
      food_ref: foodKey({ source: e.source, sourceId: e.sourceId, name: e.foodName }),
      name: e.foodName,
      brand: e.brand,
      portion: formatPortion(e),
      // Grams always reproduce the exact amount with log_meal.
      quantity: r1(e.grams),
      unit: 'g',
      calories: Math.round(entryNutrition(e).calories),
    });
    const meals = new Map<string, FoodEntry[]>();
    for (const e of week) meals.set(`${e.date}|${e.meal}`, [...(meals.get(`${e.date}|${e.meal}`) ?? []), e]);
    return ok({
      today,
      favorites: saved.favorites.map((f) => {
        const grams = f.portion.unit === 'serving' && f.portion.serving ? f.portion.quantity * f.portion.serving.grams : null;
        return {
          food_ref: f.key,
          name: f.food.name,
          brand: f.food.brand,
          usual_portion:
            f.portion.unit === 'serving'
              ? { quantity: r1(grams ?? 0), unit: 'g', description: `${f.portion.quantity} × ${f.portion.serving?.label}` }
              : { quantity: f.portion.quantity, unit: f.portion.unit, description: `${f.portion.quantity} ${f.portion.unit}` },
        };
      }),
      recent_foods: saved.recent.slice(0, 25).map((r) => ({ ...asLoggable(r.last), last_logged: r.last.date })),
      meals_last_7_days: [...meals.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([key, list]) => {
          const [date, meal] = key.split('|');
          return {
            date,
            meal: meal === 'snacks' ? 'snack' : meal,
            items: list.map(asLoggable),
            ...macros(totalNutrition(list)),
          };
        }),
    });
  },
};

// ---------- get_daily_summary ----------

const getDailySummary: ToolDef<{ date: typeof DATE_INPUT }> = {
  name: 'get_daily_summary',
  description:
    "Get the user's calories, protein, carbs, and fat for a day: consumed, their daily targets, and what's " +
    'remaining, plus every entry grouped by meal with its entry_id (needed for update_log_entry and ' +
    'delete_log_entry). Defaults to today in the user\'s timezone.',
  inputSchema: { date: DATE_INPUT },
  annotations: { title: 'Daily summary', readOnlyHint: true },
  async run({ date: dateInput }, ctx) {
    const settings = await ctx.store.settings();
    const d = resolveDate(dateInput, settings, ctx.now);
    if ('error' in d) return fail(d.error);
    return ok(await daySummary(ctx.store, d.date, settings));
  },
};

// ---------- update_log_entry ----------

const updateLogEntry: ToolDef<{
  entry_id: typeof ENTRY_ID;
  quantity: z.ZodOptional<typeof QUANTITY>;
  unit: z.ZodOptional<typeof UNIT>;
  food_ref: z.ZodOptional<typeof FOOD_REF>;
  meal: z.ZodOptional<typeof MEAL_INPUT>;
}> = {
  name: 'update_log_entry',
  description:
    "Change one of the user's logged entries: its amount (quantity and/or unit), swap it for a different food " +
    '(food_ref from search_foods or preview_meal), or move it to another meal. Get the entry_id from ' +
    'get_daily_summary. If only quantity is given, the entry keeps its current unit. Tell the user what changed.',
  inputSchema: {
    entry_id: ENTRY_ID,
    quantity: QUANTITY.optional(),
    unit: UNIT.optional(),
    food_ref: FOOD_REF.optional().describe('Replace the food with this one (keeps the amount unless quantity/unit are given).'),
    meal: MEAL_INPUT.optional(),
  },
  annotations: { title: 'Update a log entry', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async run({ entry_id, quantity, unit, food_ref, meal }, ctx) {
    if (quantity === undefined && unit === undefined && food_ref === undefined && meal === undefined) {
      return fail('Nothing to change: give a new quantity, unit, food_ref, or meal.');
    }
    const entry = await ctx.store.getEntry(entry_id);
    if (!entry) return fail(`No entry with id ${entry_id} in the user's log. Call get_daily_summary to get current entry ids.`);

    let food = foodFromEntry(entry);
    if (food_ref) {
      const settings = await ctx.store.settings();
      const saved = await loadSavedFoods(ctx.store, dateKeyInTimeZone(ctx.now, settings.timezone));
      const replacement = await resolveFoodRef(food_ref, saved, ctx.foods).catch(() => null);
      if (!replacement) return fail(`food_ref "${food_ref}" was not found. Use search_foods to get a current one.`);
      food = replacement;
    }

    let portion: Portion;
    if (unit !== undefined) {
      const r = resolvePortion(food, quantity ?? entry.quantity, unit);
      if (!r.ok) return fail(r.error);
      portion = r.value.portion;
    } else if (quantity !== undefined && entry.unit === 'serving' && entry.serving && !food_ref) {
      // "Make it 2" on a serving-based entry means 2 of the same serving.
      const r = resolvePortion({ ...food, servings: [entry.serving] }, quantity, 'serving');
      if (!r.ok) return fail(r.error);
      portion = r.value.portion;
    } else if (quantity !== undefined) {
      const r = resolvePortion(food, quantity, entry.unit === 'serving' ? 'g' : entry.unit);
      if (!r.ok) return fail(r.error);
      portion = r.value.portion;
    } else {
      // Food or meal change only: keep the same weight.
      portion = { quantity: entry.grams, unit: 'g' };
    }

    const updated = buildEntry({
      id: entry.id,
      date: entry.date,
      meal: meal ? toMeal(meal) : entry.meal,
      food,
      portion,
      createdAt: entry.createdAt,
    });
    if (!(await ctx.store.replaceEntry(updated))) {
      return fail(`No entry with id ${entry_id} in the user's log. Nothing was changed.`);
    }
    const settings = await ctx.store.settings();
    return ok({ before: describeEntry(entry), after: describeEntry(updated), daily_summary: await daySummary(ctx.store, entry.date, settings) });
  },
};

// ---------- delete_log_entry ----------

const deleteLogEntry: ToolDef<{ entry_id: typeof ENTRY_ID }> = {
  name: 'delete_log_entry',
  description:
    "Permanently delete one entry from the user's food log. ALWAYS confirm with the user first, naming the " +
    'food, portion, meal, and date, and only call this after they say yes. Get the entry_id from get_daily_summary.',
  inputSchema: { entry_id: ENTRY_ID },
  annotations: { title: 'Delete a log entry', readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  async run({ entry_id }, ctx) {
    const entry = await ctx.store.getEntry(entry_id);
    if (!entry || !(await ctx.store.deleteEntry(entry_id))) {
      return fail(`No entry with id ${entry_id} in the user's log. Nothing was deleted.`);
    }
    const settings = await ctx.store.settings();
    return ok({ deleted: describeEntry(entry), daily_summary: await daySummary(ctx.store, entry.date, settings) });
  },
};

// ---------- log_weight ----------

const displayWeight = (kg: number, unit: 'lb' | 'kg') => r1(unit === 'lb' ? kg / KG_PER_POUND : kg);

const logWeight: ToolDef<{
  weight: z.ZodNumber;
  unit: z.ZodEnum<{ lb: 'lb'; kg: 'kg' }>;
  date: typeof DATE_INPUT;
  note: z.ZodOptional<z.ZodString>;
}> = {
  name: 'log_weight',
  description:
    "Record the user's body weight for a day (one weigh-in per day; logging again for the same day replaces " +
    'it). Use the unit the user said. Returns the saved weigh-in and this week\'s average.',
  inputSchema: {
    weight: z.number().positive().describe('The weight number, e.g. 180.4.'),
    unit: z.enum(['lb', 'kg']).describe('lb or kg, as the user said.'),
    date: DATE_INPUT,
    note: z.string().max(280).optional().describe('Optional note, e.g. "after a long run".'),
  },
  annotations: { title: 'Log body weight', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  async run({ weight, unit, date: dateInput, note }, ctx) {
    const settings = await ctx.store.settings();
    const d = resolveDate(dateInput, settings, ctx.now);
    if ('error' in d) return fail(d.error);
    const weightKg = parseWeightInput(String(weight), unit === 'lb' ? 'imperial' : 'metric');
    if (weightKg === null) {
      return fail(`${weight} ${unit} isn't a plausible body weight (expected ${unit === 'lb' ? '45–880 lb' : '20–400 kg'}). Ask the user to check it.`);
    }
    const replaced = (await ctx.store.weightsBetween(d.date, d.date)).length > 0;
    await ctx.store.saveWeight({ date: d.date, weightKg, note: note?.trim() || null });
    const today = dateKeyInTimeZone(ctx.now, settings.timezone);
    const recent = await ctx.store.weightsBetween(addDays(today, -120), today);
    const wow = weekOverWeek(recent, today);
    return ok({
      saved: { date: d.date, weight: displayWeight(weightKg, unit), unit, replaced_existing_weigh_in_for_that_day: replaced },
      this_week_average: wow.current ? { weight: displayWeight(wow.current.averageKg, unit), unit, weigh_ins: wow.current.count } : null,
    });
  },
};

// ---------- get_weight_trend ----------

const getWeightTrend: ToolDef<{ days: z.ZodDefault<z.ZodNumber> }> = {
  name: 'get_weight_trend',
  description:
    "Get the user's weigh-ins for the last N days (default 30), with weekly averages (Monday–Sunday, " +
    'ignoring days without a weigh-in), the 7-day rolling average, and this week\'s change versus the most ' +
    'recent earlier week with data. Weights are in the user\'s preferred unit.',
  inputSchema: { days: z.number().int().min(1).max(730).default(30).describe('How many days back to include (1–730).') },
  annotations: { title: 'Weight trend', readOnlyHint: true },
  async run({ days }, ctx) {
    const settings = await ctx.store.settings();
    const unit = settings.unitSystem === 'imperial' ? 'lb' : 'kg';
    const today = dateKeyInTimeZone(ctx.now, settings.timezone);
    const from = addDays(today, -(days - 1));
    // Six extra days so the rolling average at the start of the range uses a full week.
    const all = await ctx.store.weightsBetween(addDays(from, -6), today);
    const inRange: WeighIn[] = all.filter((w) => w.date >= from);
    if (inRange.length === 0) {
      return ok({ days, unit, entries: [], message: `No weigh-ins in the last ${days} days.` });
    }
    const rolling = new Map(rollingAverage(all).map((p) => [p.date, p.averageKg]));
    const wow = weekOverWeek(all, today);
    return ok({
      days,
      unit,
      entries: inRange.map((w) => ({
        date: w.date,
        weight: displayWeight(w.weightKg, unit),
        rolling_7_day_average: displayWeight(rolling.get(w.date) ?? w.weightKg, unit),
        note: w.note ?? undefined,
      })),
      weekly_averages: weeklyAverages(inRange)
        .reverse()
        .map((wk) => ({ week_starting: wk.weekStart, average: displayWeight(wk.averageKg, unit), weigh_ins: wk.count })),
      this_week: wow.current ? displayWeight(wow.current.averageKg, unit) : null,
      change_vs_previous_week: wow.changeKg === null ? null : displayWeight(wow.changeKg, unit),
      previous_week_starting: wow.previous?.weekStart ?? null,
    });
  },
};

export const TOOLS = [
  previewMeal,
  logMeal,
  searchFoods,
  getRecentFoods,
  getDailySummary,
  updateLogEntry,
  deleteLogEntry,
  logWeight,
  getWeightTrend,
] as unknown as ToolDef[];
