// Recipe editor: name, ingredients (each a food plus the amount used), and the yield (servings and/or the
// cooked weight). Totals are computed in src/lib/recipes.ts. Also the amount step for one ingredient.

import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, Space, useColors } from '@/constants/theme';
import { useRecipesStore } from '@/data/data-provider';
import type { Portion } from '@/lib/entries';
import type { FoodItem } from '@/lib/foods';
import { formatKcal } from '@/lib/format';
import { nutritionForGrams, type Nutrition } from '@/lib/macros';
import {
  ingredientAmount,
  ingredientNutrition,
  makeIngredient,
  RECIPE_LIMITS,
  recipePerServing,
  recipeTotals,
  validateRecipe,
  type Recipe,
  type RecipeErrors,
  type RecipeIngredient,
} from '@/lib/recipes';
import { parseNumber } from '@/lib/settings-form';
import { hasKnownWeight, portionToGrams, type PortionUnit, type Serving } from '@/lib/units';

import { AppText, Banner, Button, Card, Chip, Field } from './ui';

/** A recipe being created or edited (kept by the Add food screen while ingredients are picked). */
export type RecipeDraft = {
  id: string | null; // null = new recipe
  name: string;
  ingredients: RecipeIngredient[];
  servings: string;
  cookedGrams: string;
};

export const draftFromRecipe = (r: Recipe | null, name = ''): RecipeDraft =>
  r
    ? {
        id: r.id,
        name: r.name,
        ingredients: r.ingredients,
        servings: r.servings === null ? '' : String(r.servings),
        cookedGrams: r.cookedGrams === null ? '' : String(r.cookedGrams),
      }
    : { id: null, name, ingredients: [], servings: '', cookedGrams: '' };

/** "P 27 · F 34 · C 56" in the app's macro order. */
function MacroLine({ n, prefix }: { n: Nutrition; prefix?: string }) {
  const c = useColors();
  return (
    <AppText variant="small">
      {prefix}
      <AppText variant="small" style={{ color: c.protein }}>
        P {Math.round(n.protein)}
      </AppText>{' '}
      ·{' '}
      <AppText variant="small" style={{ color: c.fat }}>
        F {Math.round(n.fat)}
      </AppText>{' '}
      ·{' '}
      <AppText variant="small" style={{ color: c.carbs }}>
        C {Math.round(n.carbs)}
      </AppText>
    </AppText>
  );
}

export function RecipeEditor({
  draft,
  onChange,
  onAddIngredient,
  onEditIngredient,
  onSaved,
  onDeleted,
  onCancel,
}: {
  draft: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
  onAddIngredient: () => void;
  onEditIngredient: (index: number) => void;
  onSaved: (recipe: Recipe) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const c = useColors();
  const store = useRecipesStore();
  const [errors, setErrors] = useState<RecipeErrors & { form?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (patch: Partial<RecipeDraft>) => onChange({ ...draft, ...patch });
  const optional = (text: string) => (text.trim() ? parseNumber(text) : null);
  const servings = optional(draft.servings);
  const cooked = optional(draft.cookedGrams);

  const totals = recipeTotals(draft);
  const perServing = servings ? recipePerServing({ ingredients: draft.ingredients, servings }) : null;

  const save = () => {
    const badNumber: RecipeErrors = {};
    if (draft.servings.trim() && servings === null) badNumber.servings = 'Enter a number.';
    if (draft.cookedGrams.trim() && cooked === null) badNumber.cookedGrams = 'Enter a number.';
    const result = validateRecipe({ name: draft.name, ingredients: draft.ingredients, servings, cookedGrams: cooked });
    const all = { ...(result.ok ? {} : result.errors), ...badNumber };
    setErrors(all);
    if (!result.ok || Object.keys(badNumber).length) return;
    const recipe: Recipe = { ...result.value, id: draft.id ?? Crypto.randomUUID(), updatedAt: new Date().toISOString() };
    store.save(recipe);
    onSaved(recipe);
  };

  const remove = () => {
    if (!draft.id) return;
    store.remove(draft.id);
    onDeleted();
  };

  return (
    <>
      <Card>
        <Field
          label="Recipe name"
          value={draft.name}
          onChangeText={(name) => update({ name })}
          placeholder="Sausage pasta"
          maxLength={RECIPE_LIMITS.nameLength}
          error={errors.name}
        />
      </Card>

      <Card style={styles.list}>
        <AppText variant="heading">Ingredients</AppText>
        {draft.ingredients.length === 0 ? (
          <AppText variant="small">Add each ingredient with the amount you used, as you weighed or measured it.</AppText>
        ) : null}
        {draft.ingredients.map((ing, i) => (
          <Pressable
            key={`${i}-${ing.food.name}`}
            onPress={() => onEditIngredient(i)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${ing.food.name}`}
            style={({ pressed }) => [styles.row, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.flex}>
              <AppText numberOfLines={2}>{ing.food.name}</AppText>
              <AppText variant="small" numberOfLines={1}>
                {ing.food.brand ? `${ing.food.brand} · ` : ''}
                {ingredientAmount(ing)}
              </AppText>
            </View>
            <AppText>{formatKcal(ingredientNutrition(ing).calories)}</AppText>
          </Pressable>
        ))}
        {errors.ingredients ? (
          <AppText variant="small" style={{ color: c.danger }}>
            {errors.ingredients}
          </AppText>
        ) : null}
        <Button title="Add ingredient" variant="ghost" onPress={onAddIngredient} />
      </Card>

      <Card>
        <AppText variant="heading">Makes</AppText>
        <View style={styles.fields}>
          <Field
            label="Servings"
            value={draft.servings}
            onChangeText={(s) => update({ servings: s })}
            keyboardType="decimal-pad"
            placeholder="4"
            style={styles.flex}
            error={errors.servings}
          />
          <Field
            label="Cooked weight"
            value={draft.cookedGrams}
            onChangeText={(g) => update({ cookedGrams: g })}
            keyboardType="decimal-pad"
            suffix="g"
            style={styles.flex}
            error={errors.cookedGrams}
          />
        </View>
        <AppText variant="small">
          Enter either or both. For the cooked weight, weigh the finished dish and subtract the pot; it lets you log
          exact ounces. You can update it each time you cook.
        </AppText>
      </Card>

      {draft.ingredients.length > 0 ? (
        <Card>
          <View style={styles.total}>
            <AppText variant="label">Whole batch</AppText>
            <AppText variant="label">{formatKcal(totals.calories)} kcal</AppText>
          </View>
          <MacroLine n={totals} />
          {perServing ? (
            <>
              <View style={styles.total}>
                <AppText variant="label">Per serving</AppText>
                <AppText variant="label">{formatKcal(perServing.calories)} kcal</AppText>
              </View>
              <MacroLine n={perServing} />
            </>
          ) : null}
        </Card>
      ) : null}

      {Object.keys(errors).length ? <Banner>Fix the highlighted fields.</Banner> : null}
      <Button title={draft.id ? 'Save recipe' : 'Save and continue'} onPress={save} />
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
      {draft.id ? (
        confirmDelete ? (
          <Card>
            <AppText>Delete “{draft.name}”? Meals you already logged stay as they are.</AppText>
            <View style={styles.fields}>
              <Button title="Keep" variant="secondary" onPress={() => setConfirmDelete(false)} style={styles.flex} />
              <Button title="Delete" variant="danger" onPress={remove} style={styles.flex} />
            </View>
          </Card>
        ) : (
          <Button title="Delete recipe" variant="ghost" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </>
  );
}

// ---------- One ingredient's amount ----------

type UnitChoice = { unit: 'g' } | { unit: 'oz' } | { unit: 'serving'; serving: Serving };
const choiceKey = (u: UnitChoice) => (u.unit === 'serving' ? `serving:${u.serving.label}` : u.unit);

export function IngredientStep({
  food,
  initial,
  onDone,
  onRemove,
  onBack,
}: {
  food: FoodItem;
  /** The amount when editing an ingredient (or a remembered portion). */
  initial: Portion | null;
  onDone: (ingredient: RecipeIngredient) => void;
  onRemove?: () => void;
  onBack: () => void;
}) {
  const weightKnown = hasKnownWeight(food);
  const choices: { choice: UnitChoice; label: string }[] = [
    ...food.servings.map((s) => ({ choice: { unit: 'serving', serving: s } as UnitChoice, label: s.label })),
    ...(weightKnown
      ? [
          { choice: { unit: 'g' } as UnitChoice, label: 'grams' },
          { choice: { unit: 'oz' } as UnitChoice, label: 'oz' },
        ]
      : []),
  ];
  const [choice, setChoice] = useState<UnitChoice>(() => {
    const match = initial && choices.find(({ choice: ch }) =>
      ch.unit === initial.unit && (ch.unit !== 'serving' || ch.serving.label === initial.serving?.label)
    );
    return match ? match.choice : choices[0].choice;
  });
  const [qtyText, setQtyText] = useState(() => (initial ? String(initial.quantity) : choice.unit === 'g' ? '100' : '1'));
  const quantity = parseNumber(qtyText);
  const unit: PortionUnit = choice.unit;
  const serving = choice.unit === 'serving' ? choice.serving : null;
  const grams = quantity !== null && quantity > 0 ? portionToGrams(quantity, unit, serving) : null;
  const n = grams !== null ? nutritionForGrams(food.per100g, grams) : null;

  return (
    <>
      <Card>
        <AppText variant="heading">{food.name}</AppText>
        {food.brand ? <AppText variant="small">{food.brand}</AppText> : null}
        <View style={styles.total}>
          <AppText variant="label">In the recipe</AppText>
          <AppText variant="label">{n ? `${formatKcal(n.calories)} kcal` : '–'}</AppText>
        </View>
        {n ? <MacroLine n={n} /> : null}
      </Card>
      <Card>
        <Field
          label="Amount used"
          value={qtyText}
          onChangeText={setQtyText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          error={quantity === null || quantity <= 0 ? 'Enter an amount greater than 0' : null}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel="Unit" style={styles.chips}>
          {choices.map(({ choice: ch, label }) => (
            <Chip key={choiceKey(ch)} label={label} selected={choiceKey(ch) === choiceKey(choice)} onPress={() => setChoice(ch)} />
          ))}
        </View>
      </Card>
      <Button
        title={onRemove ? 'Update ingredient' : 'Add to recipe'}
        disabled={grams === null}
        onPress={() => quantity !== null && onDone(makeIngredient(food, { quantity, unit, serving }))}
      />
      <Button title="Back" variant="secondary" onPress={onBack} />
      {onRemove ? (
        <Button title="Remove from recipe" variant="ghost" onPress={onRemove} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm + 2,
    minHeight: MIN_TOUCH + 8,
  },
  fields: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
});
