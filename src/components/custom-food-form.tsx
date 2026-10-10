// Create or edit a custom food: nutrition per serving, as printed on a label or menu.

import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Space } from '@/constants/theme';
import { useCustomFoodsStore } from '@/data/data-provider';
import {
  CUSTOM_FOOD_LIMITS,
  customFoodCalories,
  customFoodInputFromForm,
  validateCustomFood,
  type CustomFood,
  type CustomFoodErrors,
} from '@/lib/custom-foods';
import { formatKcal } from '@/lib/format';
import { parseNumber } from '@/lib/settings-form';

import { AppText, Banner, Button, Card, Field } from './ui';

type Form = {
  name: string;
  brand: string;
  servingLabel: string;
  servingGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

const str = (n: number | null) => (n === null ? '' : String(n));

function formFrom(food: CustomFood | null, name: string): Form {
  return food
    ? {
        name: food.name,
        brand: food.brand ?? '',
        servingLabel: food.servingLabel,
        servingGrams: str(food.servingGrams),
        calories: str(food.calories),
        protein: String(food.protein),
        carbs: String(food.carbs),
        fat: String(food.fat),
      }
    : { name, brand: '', servingLabel: '1 serving', servingGrams: '', calories: '', protein: '', carbs: '', fat: '' };
}

export function CustomFoodForm({
  existing,
  initialName = '',
  onSaved,
  onDeleted,
  onCancel,
}: {
  /** The food being edited, or null to create one. */
  existing: CustomFood | null;
  initialName?: string;
  onSaved: (food: CustomFood) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const store = useCustomFoodsStore();
  const [form, setForm] = useState<Form>(() => formFrom(existing, initialName));
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // Live hint: calories implied by the macros (used when Calories is left blank).
  const macroKcal = (() => {
    const [p, cb, f] = [form.protein, form.carbs, form.fat].map((t) => (t.trim() ? parseNumber(t) : 0));
    return p !== null && cb !== null && f !== null ? customFoodCalories({ calories: null, protein: p, carbs: cb, fat: f }) : null;
  })();

  const save = () => {
    const parsed = customFoodInputFromForm(form);
    const result = validateCustomFood(parsed.input);
    const all = { ...(result.ok ? {} : result.errors), ...parsed.errors };
    setErrors(all);
    if (!result.ok || Object.keys(parsed.errors).length) return;
    const food: CustomFood = {
      ...result.value,
      id: existing?.id ?? Crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    };
    store.save(food);
    onSaved(food);
  };

  const remove = () => {
    if (!existing) return;
    store.remove(existing.id);
    onDeleted?.();
  };

  const L = CUSTOM_FOOD_LIMITS;
  return (
    <>
      <Card>
        <AppText variant="heading">{existing ? 'Edit custom food' : 'New custom food'}</AppText>
        <AppText variant="small">
          Enter the nutrition for one serving, from the label, menu or recipe.
          {existing ? ' Changes apply to future logs; past entries keep their numbers.' : ''}
        </AppText>
        <Field
          label="Name"
          value={form.name}
          onChangeText={(name) => update({ name })}
          placeholder="e.g. Poke bowl (large)"
          maxLength={L.nameLength}
          autoFocus={!existing && !initialName}
          error={errors.name}
        />
        <Field
          label="Brand or restaurant (optional)"
          value={form.brand}
          onChangeText={(brand) => update({ brand })}
          maxLength={L.brandLength}
          error={errors.brand}
        />
      </Card>

      <Card>
        <AppText variant="heading">Serving</AppText>
        <View style={styles.row}>
          <Field
            label="One serving is"
            value={form.servingLabel}
            onChangeText={(servingLabel) => update({ servingLabel })}
            placeholder="1 bowl"
            maxLength={L.servingLabelLength}
            style={styles.flex}
            error={errors.servingLabel}
          />
          <Field
            label="Weight (optional)"
            value={form.servingGrams}
            onChangeText={(servingGrams) => update({ servingGrams })}
            keyboardType="decimal-pad"
            suffix="g"
            style={styles.flex}
            error={errors.servingGrams}
          />
        </View>
        <AppText variant="small">
          Without a weight you can still log it by servings (like “1.5 bowls”), just not in grams or ounces.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Nutrition per serving</AppText>
        <Field
          label="Calories (optional)"
          value={form.calories}
          onChangeText={(calories) => update({ calories })}
          keyboardType="decimal-pad"
          suffix="kcal"
          placeholder={macroKcal !== null ? `${formatKcal(macroKcal)} from macros` : undefined}
          error={errors.calories}
        />
        <View style={styles.row}>
          <Field
            label="Protein"
            value={form.protein}
            onChangeText={(protein) => update({ protein })}
            keyboardType="decimal-pad"
            suffix="g"
            style={styles.flex}
            error={errors.protein}
          />
          <Field
            label="Fat"
            value={form.fat}
            onChangeText={(fat) => update({ fat })}
            keyboardType="decimal-pad"
            suffix="g"
            style={styles.flex}
            error={errors.fat}
          />
          <Field
            label="Carbs"
            value={form.carbs}
            onChangeText={(carbs) => update({ carbs })}
            keyboardType="decimal-pad"
            suffix="g"
            style={styles.flex}
            error={errors.carbs}
          />
        </View>
        {!form.calories.trim() && macroKcal !== null ? (
          <AppText variant="small">
            Calories left blank: {formatKcal(macroKcal)} kcal will be calculated from the macros (4/4/9).
          </AppText>
        ) : null}
      </Card>

      {Object.keys(errors).length ? <Banner>Fix the highlighted fields.</Banner> : null}
      <Button title={existing ? 'Save changes' : 'Save and continue'} onPress={save} />
      <Button title="Cancel" variant="secondary" onPress={onCancel} />

      {existing ? (
        confirmDelete ? (
          <Card>
            <AppText>Delete “{existing.name}” from your custom foods? Logged entries stay as they are.</AppText>
            <View style={styles.row}>
              <Button title="Keep" variant="secondary" onPress={() => setConfirmDelete(false)} style={styles.flex} />
              <Button title="Delete" variant="danger" onPress={remove} style={styles.flex} />
            </View>
          </Card>
        ) : (
          <Button title="Delete custom food" variant="ghostDanger" onPress={() => setConfirmDelete(true)} />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
