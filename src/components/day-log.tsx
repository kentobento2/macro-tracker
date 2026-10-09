import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, Space, useColors } from '@/constants/theme';
import { useEntries, useEntriesStore, useOnline, useProfileState } from '@/data/data-provider';
import type { DateKey } from '@/lib/dates';
import { entriesByMeal, entryNutrition, MEAL_LABELS, MEALS, totalNutrition, totalsByMeal, type FoodEntry, type Meal } from '@/lib/entries';
import { formatKcal, formatPortion } from '@/lib/format';

import { NutritionSummary } from './nutrition-summary';
import { AppText, Banner, Card } from './ui';

/** A day's totals vs targets plus its four meals. Used by Today and History. */
export function DayLog({ date }: { date: DateKey }) {
  const { entries, loaded } = useEntries([date]);
  const online = useOnline();
  const { profile } = useProfileState();
  const emptyLabel = loaded ? 'Nothing logged' : online ? 'Loading…' : 'Not available offline';
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
        <View>
          <AppText variant="heading">{MEAL_LABELS[meal]}</AppText>
          <AppText variant="small">{entries.length ? `${formatKcal(kcal)} kcal` : emptyLabel}</AppText>
        </View>
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={`Add food to ${MEAL_LABELS[meal]}`}
          style={({ pressed }) => [styles.addBtn, { backgroundColor: c.track, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="add" size={24} color={c.text} />
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
      <Pressable
        onPress={edit}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${entry.foodName}`}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.6 : 1 }]}>
        <AppText numberOfLines={1}>{entry.foodName}</AppText>
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
        <Ionicons name="trash-outline" size={20} color={c.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  meal: { gap: 0, paddingVertical: Space.md },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: Space.sm },
  addBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_TOUCH + 12,
    gap: Space.sm,
  },
  rowMain: { flex: 1, minWidth: 0, paddingVertical: Space.sm, gap: 2 },
  rowKcal: { fontVariant: ['tabular-nums'] },
  delete: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginRight: -Space.sm },
});
