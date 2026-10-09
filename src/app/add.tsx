import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { AppText, Banner, Button, Card, Chip, Field, Screen, Segmented } from '@/components/ui';
import { MIN_TOUCH, Space, useColors } from '@/constants/theme';
import { useEntriesStore, useEntry, useOnline, useRecentFoods, useToday } from '@/data/data-provider';
import { FoodLookupError, lookupBarcode, searchFoods } from '@/data/food-api';
import { isDateKey, type DateKey } from '@/lib/dates';
import {
  buildEntry,
  entryNutrition,
  foodFromEntry,
  isMeal,
  MEAL_LABELS,
  MEALS,
  mealForTime,
  type FoodEntry,
  type Meal,
} from '@/lib/entries';
import { formatKcal } from '@/lib/format';
import type { FoodItem, FoodSource } from '@/lib/foods';
import { parseNumber } from '@/lib/settings-form';
import { gramsToQuantity, portionToGrams, type PortionUnit, type Serving } from '@/lib/units';

const SOURCE_LABELS: Record<FoodSource, string> = {
  usda: 'USDA FoodData Central',
  off: 'Open Food Facts',
  custom: 'Custom',
};

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: string; entryId?: string }>();
  const today = useToday();
  const existing = useEntry(params.entryId);
  const [picked, setPicked] = useState<FoodItem | null>(null);
  // Editing starts on the portion step with the logged food.
  const existingFood = useMemo(() => (existing ? foodFromEntry(existing) : null), [existing]);
  const food = picked ?? existingFood;

  const date: DateKey = existing?.date ?? (isDateKey(params.date) ? params.date : today);
  const meal: Meal = existing?.meal ?? (isMeal(params.meal) ? params.meal : mealForTime(new Date().getHours()));

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: params.entryId ? 'Edit entry' : 'Add food' }} />
      {params.entryId && !existing ? (
        <AppText variant="muted">This entry no longer exists.</AppText>
      ) : food ? (
        <PortionStep
          food={food}
          date={date}
          initialMeal={meal}
          existing={existing}
          onBack={existing ? undefined : () => setPicked(null)}
        />
      ) : (
        <SearchStep onPick={setPicked} />
      )}
    </Screen>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// ---------- Search ----------

function SearchStep({ onPick }: { onPick: (f: FoodItem) => void }) {
  const online = useOnline();
  const recent = useRecentFoods(20);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ query: string; foods?: FoodItem[]; error?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [lookupState, setLookupState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const trimmed = query.trim();
  const searchActive = online && trimmed.length >= 2;
  // Only show a result that matches what's in the box right now.
  const current = searchActive && search?.query === trimmed ? search : null;
  const results = current?.foods ?? null;
  const loading = (searchActive && !current) || lookupState.loading;
  const error = current?.error ?? lookupState.error;

  // Debounced USDA search.
  useEffect(() => {
    if (!searchActive) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const foods = await searchFoods(trimmed);
        if (!cancelled) setSearch({ query: trimmed, foods });
      } catch (e) {
        if (!cancelled) {
          setSearch({ query: trimmed, error: e instanceof FoodLookupError ? e.message : 'Search failed.' });
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searchActive]);

  const lookup = async (code: string) => {
    setScanning(false);
    const digits = code.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(digits)) {
      setLookupState({ loading: false, error: 'Barcodes are 8 to 14 digits.' });
      return;
    }
    setLookupState({ loading: true, error: null });
    try {
      const food = await lookupBarcode(digits);
      if (food) {
        setLookupState({ loading: false, error: null });
        onPick(food);
      } else {
        setLookupState({ loading: false, error: `No nutrition data found for barcode ${digits} in Open Food Facts.` });
      }
    } catch (e) {
      setLookupState({ loading: false, error: e instanceof FoodLookupError ? e.message : 'Barcode lookup failed.' });
    }
  };

  const recentMatches = useMemo(() => {
    const q = trimmed.toLowerCase();
    return recent.filter((r) => !q || r.food.name.toLowerCase().includes(q) || r.food.brand?.toLowerCase().includes(q));
  }, [recent, trimmed]);

  if (scanning) {
    return (
      <Card>
        <AppText variant="heading">Scan barcode</AppText>
        <BarcodeScanner onDetected={lookup} onCancel={() => setScanning(false)} />
      </Card>
    );
  }

  return (
    <>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={online ? 'Search foods (e.g. chicken breast)' : 'Search recent foods'}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search foods"
      />

      {online ? (
        <View style={styles.row}>
          <Button
            title="Scan barcode"
            variant="secondary"
            onPress={() => setScanning(true)}
            style={styles.flex}
            icon={<ScanIcon />}
          />
        </View>
      ) : (
        <Banner>You’re offline. Search and barcodes need a connection; you can still log recent foods.</Banner>
      )}

      {online ? (
        <View style={styles.row}>
          <Field
            value={barcode}
            onChangeText={setBarcode}
            placeholder="Or type a barcode number"
            keyboardType="number-pad"
            returnKeyType="go"
            onSubmitEditing={() => lookup(barcode)}
            accessibilityLabel="Barcode number"
          />
          <Button title="Look up" variant="secondary" onPress={() => lookup(barcode)} disabled={!barcode.trim()} />
        </View>
      ) : null}

      {error ? <Banner>{error}</Banner> : null}
      {loading ? <ActivityIndicator style={{ marginVertical: Space.md }} /> : null}

      {results ? (
        <Card style={styles.list}>
          <AppText variant="label">Results from USDA</AppText>
          {results.length === 0 ? <AppText variant="muted">No matches. Try a simpler term.</AppText> : null}
          {results.map((f) => (
            <FoodRow key={`${f.source}:${f.sourceId}`} food={f} onPress={() => onPick(f)} />
          ))}
        </Card>
      ) : null}

      {!results && recentMatches.length > 0 ? (
        <Card style={styles.list}>
          <AppText variant="label">Recent</AppText>
          {recentMatches.map(({ food, last }) => (
            <FoodRow key={last.id} food={food} onPress={() => onPick(food)} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

function ScanIcon() {
  const c = useColors();
  return <Ionicons name="barcode-outline" size={20} color={c.primary} />;
}

function FoodRow({ food, onPress }: { food: FoodItem; onPress: () => void }) {
  const c = useColors();
  const n = food.per100g;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Choose ${food.name}`}
      style={({ pressed }) => [styles.foodRow, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <AppText numberOfLines={2}>{food.name}</AppText>
        <AppText variant="small" numberOfLines={1}>
          {food.brand ? `${food.brand} · ` : ''}per 100 g: {formatKcal(n.calories)} kcal · P {Math.round(n.protein)} · C{' '}
          {Math.round(n.carbs)} · F {Math.round(n.fat)}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

// ---------- Portion ----------

type UnitChoice = { unit: 'g' } | { unit: 'oz' } | { unit: 'serving'; serving: Serving };

const choiceKey = (u: UnitChoice) => (u.unit === 'serving' ? `serving:${u.serving.label}` : u.unit);
const servingOf = (u: UnitChoice) => (u.unit === 'serving' ? u.serving : null);

/** Round a quantity sensibly for the unit it's shown in. */
function roundForUnit(q: number, unit: PortionUnit): number {
  const places = unit === 'g' ? 0 : unit === 'oz' ? 1 : 2;
  const f = 10 ** places;
  return Math.round(q * f) / f;
}

function PortionStep({
  food,
  date,
  initialMeal,
  existing,
  onBack,
}: {
  food: FoodItem;
  date: DateKey;
  initialMeal: Meal;
  existing: FoodEntry | null;
  onBack?: () => void;
}) {
  const c = useColors();
  const store = useEntriesStore();

  const [choice, setChoice] = useState<UnitChoice>(() => {
    if (existing) {
      return existing.unit === 'serving' && existing.serving
        ? { unit: 'serving', serving: existing.serving }
        : { unit: existing.unit === 'oz' ? 'oz' : 'g' };
    }
    return food.servings[0] ? { unit: 'serving', serving: food.servings[0] } : { unit: 'g' };
  });
  const [qtyText, setQtyText] = useState(() =>
    existing ? String(existing.quantity) : food.servings[0] ? '1' : '100'
  );
  const [meal, setMeal] = useState<Meal>(initialMeal);

  const choices: { choice: UnitChoice; label: string }[] = [
    ...food.servings.map((s) => ({ choice: { unit: 'serving', serving: s } as UnitChoice, label: s.label })),
    { choice: { unit: 'g' }, label: 'grams' },
    { choice: { unit: 'oz' }, label: 'oz' },
  ];

  const quantity = parseNumber(qtyText);
  const gramsFor = (q: number | null, u: UnitChoice) =>
    q !== null && q > 0 ? portionToGrams(q, u.unit, servingOf(u)) : null;

  // The amount the user actually entered, in grams. Unit switches convert from this, not from the
  // rounded number on screen, so banana -> oz -> banana comes back to exactly 1 banana.
  const [enteredGrams, setEnteredGrams] = useState(() => gramsFor(parseNumber(qtyText), choice));

  const onChangeQty = (text: string) => {
    setQtyText(text);
    setEnteredGrams(gramsFor(parseNumber(text), choice));
  };

  const entry =
    quantity !== null && quantity > 0
      ? buildEntry({
          id: existing?.id ?? 'preview',
          date,
          meal,
          food,
          portion: { quantity, unit: choice.unit, serving: servingOf(choice) },
          createdAt: existing?.createdAt ?? '',
        })
      : null;
  const n = entry ? entryNutrition(entry) : null;

  const switchUnit = (next: UnitChoice) => {
    // Keep the same amount of food when switching units.
    if (enteredGrams !== null) {
      setQtyText(String(roundForUnit(gramsToQuantity(enteredGrams, next.unit, servingOf(next)), next.unit)));
    }
    setChoice(next);
  };

  const save = () => {
    if (!entry) return;
    store.save({
      ...entry,
      id: existing?.id ?? Crypto.randomUUID(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    close();
  };

  const remove = () => {
    if (!existing) return;
    store.remove(existing.id);
    close();
  };

  return (
    <>
      <Card>
        <AppText variant="heading">{food.name}</AppText>
        <AppText variant="small">
          {food.brand ? `${food.brand} · ` : ''}
          {SOURCE_LABELS[food.source]}
        </AppText>
        {food.caloriesDerived ? (
          <AppText variant="small">Calories weren’t listed, so they’re calculated from the macros.</AppText>
        ) : null}
        {onBack ? <Button title="Choose a different food" variant="ghost" onPress={onBack} /> : null}
      </Card>

      <Card>
        <Field
          label="Amount"
          value={qtyText}
          onChangeText={onChangeQty}
          keyboardType="decimal-pad"
          selectTextOnFocus
          error={quantity === null || quantity <= 0 ? 'Enter an amount greater than 0' : null}
        />
        <AppText variant="label">Unit</AppText>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {choices.map(({ choice: ch, label }) => (
            <Chip
              key={choiceKey(ch)}
              label={label}
              selected={choiceKey(ch) === choiceKey(choice)}
              onPress={() => switchUnit(ch)}
            />
          ))}
        </View>

        <AppText variant="label">Meal</AppText>
        <Segmented
          accessibilityLabel="Meal"
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
        />
      </Card>

      <Card>
        <View style={styles.totals}>
          <View>
            <AppText style={styles.bigKcal}>{n ? formatKcal(n.calories) : '–'}</AppText>
            <AppText variant="muted">kcal{entry ? ` · ${Math.round(entry.grams)} g` : ''}</AppText>
          </View>
          <View style={styles.macroCol}>
            <Macro label="Protein" value={n?.protein} color={c.protein} />
            <Macro label="Carbs" value={n?.carbs} color={c.carbs} />
            <Macro label="Fat" value={n?.fat} color={c.fat} />
          </View>
        </View>
      </Card>

      <Button title={existing ? 'Save changes' : 'Add to log'} onPress={save} disabled={!entry} />
      {existing ? <Button title="Delete entry" variant="danger" onPress={remove} /> : null}
    </>
  );
}

function Macro({ label, value, color }: { label: string; value: number | undefined; color: string }) {
  return (
    <View style={styles.macro}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="small" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="label">{value === undefined ? '–' : `${Math.round(value)}g`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  list: { gap: 0 },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm + 2,
    minHeight: MIN_TOUCH + 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  totals: { flexDirection: 'row', alignItems: 'center', gap: Space.xl },
  bigKcal: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macroCol: { flex: 1, gap: Space.xs },
  macro: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
