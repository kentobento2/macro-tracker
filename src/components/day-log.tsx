import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Font, MIN_TOUCH, Space, useColors } from '@/constants/theme';
import { useEntries, useEntriesStore, useOnline, useProfileState } from '@/data/data-provider';
import type { DateKey } from '@/lib/dates';
import { entriesByMeal, entryNutrition, MEAL_LABELS, MEALS, totalNutrition, totalsByMeal, type FoodEntry, type Meal } from '@/lib/entries';
import { foodEmoji } from '@/lib/food-emoji';
import { formatKcal, formatPortion } from '@/lib/format';

import { NutritionSummary } from './nutrition-summary';
import { AppText, Banner, Card, FoodEmoji } from './ui';

const MEAL_ICONS: Record<Meal, ComponentProps<typeof Ionicons>['name']> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snacks: 'cafe-outline',
};

/** A day's totals vs targets plus its four meals. Used by Today and History. */
export function DayLog({ date }: { date: DateKey }) {
  const { entries, loaded } = useEntries([date]);
  const online = useOnline();
  const { profile } = useProfileState();
  const emptyLabel = loaded ? 'Nothing yet' : online ? 'Loading…' : 'Not available offline';
  const byMeal = entriesByMeal(entries);
  const mealTotals = totalsByMeal(entries);

  return (
    <>
      {!loaded && !online ? (
        <Banner>This day isn’t saved on this device. Connect to the internet to see what was logged.</Banner>
      ) : null}
      <NutritionSummary consumed={totalNutrition(entries)} targets={profile?.targets ?? null} />
      {MEALS.map((meal) => (
        <MealSection
          key={meal}
          date={date}
          meal={meal}
          entries={byMeal[meal]}
          kcal={mealTotals[meal].calories}
          emptyLabel={emptyLabel}
        />
      ))}
    </>
  );
}

function MealSection({
  date,
  meal,
  entries,
  kcal,
  emptyLabel,
}: {
  date: DateKey;
  meal: Meal;
  entries: FoodEntry[];
  kcal: number;
  emptyLabel: string;
}) {
  const c = useColors();
  const add = () => router.push({ pathname: '/add', params: { date, meal } });

  return (
    <Card style={styles.meal}>
      <View style={styles.mealHeader}>
        <View style={[styles.mealIcon, { backgroundColor: c.track }]}>
          <Ionicons name={MEAL_ICONS[meal]} size={20} color={c.muted} />
        </View>
        <View style={styles.mealTitle}>
          <AppText variant="heading">{MEAL_LABELS[meal]}</AppText>
          <AppText variant="small">{entries.length ? `${formatKcal(kcal)} kcal` : emptyLabel}</AppText>
        </View>
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${MEAL_LABELS[meal]}`}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: c.primarySoft, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="add" size={24} color={c.primary} />
        </Pressable>
      </View>
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} />
      ))}
    </Card>
  );
}

function EntryRow({ entry }: { entry: FoodEntry }) {
  const c = useColors();
  const store = useEntriesStore();
  const n = entryNutrition(entry);
  const edit = () => router.push({ pathname: '/add', params: { entryId: entry.id } });

  return (
    <View style={[styles.row, { borderTopColor: c.border }]}>
      <FoodEmoji emoji={foodEmoji(entry.foodName, entry.recipe)} />
      <Pressable
        onPress={edit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${entry.foodName}`}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}>
        <AppText numberOfLines={1} style={styles.foodName}>
          {entry.foodName}
        </AppText>
        <AppText variant="small" numberOfLines={1}>
          {formatPortion(entry)} ·{' '}
          <AppText variant="small" style={{ color: c.protein }}>P {Math.round(n.protein)}</AppText>{' '}
          <AppText variant="small" style={{ color: c.fat }}>F {Math.round(n.fat)}</AppText>{' '}
          <AppText variant="small" style={{ color: c.carbs }}>C {Math.round(n.carbs)}</AppText>
        </AppText>
      </Pressable>
      <AppText variant="label" style={styles.rowKcal}>
        {formatKcal(n.calories)}
      </AppText>
      <Pressable
        onPress={() => store.remove(entry.id)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${entry.foodName}`}
        hitSlop={4}
        style={({ pressed }) => [styles.delete, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="trash-outline" size={19} color={c.muted} style={styles.deleteIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  meal: { gap: 0, paddingVertical: Space.md },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingBottom: Space.sm },
  mealIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mealTitle: { flex: 1, minWidth: 0 },
  addBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH + 12,
    gap: Space.sm,
  },
  rowMain: { flex: 1, minWidth: 0, paddingVertical: Space.sm, gap: 2 },
  foodName: { fontFamily: Font.semibold },
  rowKcal: { fontVariant: ['tabular-nums'] },
  deleteIcon: { opacity: 0.7 },
  delete: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -Space.sm },
});
