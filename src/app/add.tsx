import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import {
  ActionButton,
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  Field,
  ProgressRing,
  Screen,
  SectionTitle,
  Segmented,
  StatColumn,
} from '@/components/ui';
import { MIN_TOUCH, Space, useColors } from '@/constants/theme';
import {
  useEntriesStore,
  useEntry,
  useFavorites,
  useFavoritesStore,
  useOnline,
  useProfileState,
  useRecentFoods,
  useToday,
} from '@/data/data-provider';
import {
  FoodLookupError,
  lookupBarcode,
  searchFoods,
  searchOpenFoodFacts,
  withServings,
  type SearchResults,
} from '@/data/food-api';
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
  type Portion,
} from '@/lib/entries';
import { formatKcal } from '@/lib/format';
import { macroCaloriePercents, percentOfTarget } from '@/lib/macros';
import { filterFavorites, makeFavorite } from '@/lib/favorites';
import { foodKey, type FoodItem, type FoodSource } from '@/lib/foods';
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
  const [picked, setPicked] = useState<{ food: FoodItem; portion?: Portion } | null>(null);
  // Editing starts on the portion step with the logged food.
  const existingFood = useMemo(() => (existing ? foodFromEntry(existing) : null), [existing]);
  const food = picked?.food ?? existingFood;

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
          initialPortion={existing ? null : (picked?.portion ?? null)}
          onBack={existing ? undefined : () => setPicked(null)}
        />
      ) : (
        <SearchStep onPick={(f, portion) => setPicked({ food: f, portion })} />
      )}
    </Screen>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// ---------- Search ----------

function SearchStep({ onPick }: { onPick: (f: FoodItem, portion?: Portion) => void }) {
  const online = useOnline();
  const recent = useRecentFoods(20);
  const { favorites } = useFavorites();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ query: string; foods?: SearchResults; error?: string } | null>(null);
  const [offSearch, setOffSearch] = useState<{ query: string; foods?: FoodItem[]; error?: string } | null>(null);
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
  // Open Food Facts loads separately (it's slower and more rate-limited) so USDA results show first.
  const offCurrent = searchActive && offSearch?.query === trimmed ? offSearch : null;
  const offFoods = offCurrent?.foods ?? [];
  const offLoading = searchActive && !offCurrent;

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

  // Debounced Open Food Facts search (a little longer: OFF allows ~10 searches a minute).
  useEffect(() => {
    if (!searchActive) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const foods = await searchOpenFoodFacts(trimmed);
        if (!cancelled) setOffSearch({ query: trimmed, foods });
      } catch (e) {
        if (!cancelled) {
          setOffSearch({
            query: trimmed,
            error:
              e instanceof FoodLookupError && e.kind === 'rate_limited'
                ? 'Open Food Facts is busy right now. Try again in a minute.'
                : e instanceof FoodLookupError && e.kind === 'offline'
                  ? e.message
                  : 'Open Food Facts search failed.',
          });
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searchActive]);

  /** Open Food Facts search hits lack serving sizes; fetch the full product before opening it. */
  const pickOff = async (food: FoodItem) => {
    setLookupState({ loading: true, error: null });
    const full = await withServings(food);
    setLookupState({ loading: false, error: null });
    onPick(full);
  };

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

  const favoriteMatches = useMemo(() => filterFavorites(favorites, trimmed), [favorites, trimmed]);
  const favoriteKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites]);

  const recentMatches = useMemo(() => {
    const q = trimmed.toLowerCase();
    return recent.filter(
      (r) =>
        !favoriteKeys.has(foodKey(r.food)) &&
        (!q || r.food.name.toLowerCase().includes(q) || r.food.brand?.toLowerCase().includes(q))
    );
  }, [recent, trimmed, favoriteKeys]);

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

      {results && results.whole.length + results.branded.length === 0 && offCurrent && offFoods.length === 0 ? (
        <Card>
          <AppText variant="muted">No matches. Try a simpler term.</AppText>
        </Card>
      ) : null}
      {results && results.whole.length > 0 ? (
        <Card style={styles.list}>
          <AppText variant="label">Whole foods · USDA</AppText>
          {results.whole.map((f) => (
            <FoodRow key={foodKey(f)} food={f} onPress={() => onPick(f)} />
          ))}
        </Card>
      ) : null}
      {results && results.branded.length > 0 ? (
        <Card style={styles.list}>
          <AppText variant="label">Brands & packaged · USDA</AppText>
          {results.branded.map((f) => (
            <FoodRow key={foodKey(f)} food={f} onPress={() => onPick(f)} />
          ))}
        </Card>
      ) : null}
      {results && (offLoading || offFoods.length > 0 || offCurrent?.error) ? (
        <Card style={styles.list}>
          <AppText variant="label">Community · Open Food Facts</AppText>
          {offLoading ? <ActivityIndicator style={{ marginVertical: Space.sm }} /> : null}
          {offCurrent?.error ? <AppText variant="small">{offCurrent.error}</AppText> : null}
          {offFoods.map((f) => (
            <FoodRow key={foodKey(f)} food={f} onPress={() => pickOff(f)} />
          ))}
        </Card>
      ) : null}

      {!results && favoriteMatches.length > 0 ? (
        <Card style={styles.list}>
          <AppText variant="label">Favorites</AppText>
          {favoriteMatches.map((fav) => (
            <FoodRow key={fav.key} food={fav.food} favorite onPress={() => onPick(fav.food, fav.portion)} />
          ))}
        </Card>
      ) : null}

      {!results && recentMatches.length > 0 ? (
        <Card style={styles.list}>
          <AppText variant="label">Recent</AppText>
          {recentMatches.map(({ food, last }) => (
            <FoodRow
              key={last.id}
              food={food}
              onPress={() => onPick(food, { quantity: last.quantity, unit: last.unit, serving: last.serving })}
            />
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

function FoodRow({ food, onPress, favorite }: { food: FoodItem; onPress: () => void; favorite?: boolean }) {
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
      {favorite ? <Ionicons name="heart" size={16} color={c.fat} accessibilityLabel="Favorite" /> : null}
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
  initialPortion,
  onBack,
}: {
  food: FoodItem;
  date: DateKey;
  initialMeal: Meal;
  existing: FoodEntry | null;
  /** Portion to start from (a favorite's saved portion, or the last portion logged for a recent food). */
  initialPortion: Portion | null;
  onBack?: () => void;
}) {
  const c = useColors();
  const store = useEntriesStore();
  const today = useToday();
  const { profile } = useProfileState();
  const favoritesStore = useFavoritesStore();
  const { favorites } = useFavorites();

  // Start from the entry being edited, else a provided portion, else 1 serving / 100 g.
  const startCandidate: Portion | null = existing
    ? { quantity: existing.quantity, unit: existing.unit, serving: existing.serving }
    : initialPortion;
  const start = startCandidate && (startCandidate.unit !== 'serving' || startCandidate.serving) ? startCandidate : null;

  const [choice, setChoice] = useState<UnitChoice>(() => {
    if (start) {
      return start.unit === 'serving' && start.serving
        ? { unit: 'serving', serving: start.serving }
        : { unit: start.unit === 'oz' ? 'oz' : 'g' };
    }
    return food.servings[0] ? { unit: 'serving', serving: food.servings[0] } : { unit: 'g' };
  });
  const [qtyText, setQtyText] = useState(() => (start ? String(start.quantity) : food.servings[0] ? '1' : '100'));
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

  const key = foodKey(food);
  const isFavorite = favorites.some((f) => f.key === key);
  /** Favorite with the current portion, or remove from favorites. */
  const toggleFavorite = () => {
    if (isFavorite) favoritesStore.remove(key);
    else if (entry && quantity !== null)
      favoritesStore.save(
        makeFavorite(food, { quantity, unit: choice.unit, serving: servingOf(choice) }, new Date().toISOString())
      );
  };

  /** Log the same food and portion again as a new entry today (keeps the original). */
  const logAgainToday = () => {
    if (!entry) return;
    store.save({ ...entry, id: Crypto.randomUUID(), date: today, createdAt: new Date().toISOString() });
    close();
  };

  // Share of calories from each macro is a property of the food, so it doesn't change with portion size.
  const split = macroCaloriePercents(food.per100g);
  const targets = profile?.targets ?? null;
  const fmt1 = (v: number | undefined) => (v === undefined ? '–' : v.toFixed(1));

  return (
    <>
      <Card>
        <View>
          <AppText variant="heading">{food.name}</AppText>
          <AppText variant="small">
            {food.brand ? `${food.brand} · ` : ''}
            {SOURCE_LABELS[food.source]}
          </AppText>
        </View>

        <View style={styles.stats}>
          <View style={styles.statCalories}>
            <StatColumn
              size="lg"
              align="start"
              value={n ? formatKcal(n.calories) : '–'}
              label="Calories"
              color={c.calories}
            />
          </View>
          <StatColumn value={fmt1(n?.protein)} label="Protein" pill={`${split.protein}%`} color={c.protein} />
          <StatColumn value={fmt1(n?.fat)} label="Fat" pill={`${split.fat}%`} color={c.fat} />
          <StatColumn value={fmt1(n?.carbs)} label="Carbs" pill={`${split.carbs}%`} color={c.carbs} />
        </View>
        {food.caloriesDerived ? (
          <AppText variant="small">Calories weren’t listed, so they’re calculated from the macros.</AppText>
        ) : null}

        <View style={[styles.actions, { borderTopColor: c.border }]}>
            <ActionButton
              icon={isFavorite ? 'heart' : 'heart-outline'}
              label={isFavorite ? 'Favorited' : 'Favorite'}
              active={isFavorite}
              onPress={toggleFavorite}
            />
            {onBack ? <ActionButton icon="swap-horizontal" label="Change" onPress={onBack} /> : null}
            {existing ? <ActionButton icon="copy-outline" label="Log today" onPress={logAgainToday} /> : null}
            {existing ? <ActionButton icon="trash-outline" label="Delete" tone="danger" onPress={remove} /> : null}
          </View>
      </Card>

      <Card>
        <SectionTitle>Impact on Targets</SectionTitle>
        {targets ? (
          <View style={styles.rings}>
            <ProgressRing percent={percentOfTarget(n?.calories ?? 0, targets.calories)} label="Calories" color={c.calories} />
            <ProgressRing percent={percentOfTarget(n?.protein ?? 0, targets.protein)} label="Protein" color={c.protein} />
            <ProgressRing percent={percentOfTarget(n?.fat ?? 0, targets.fat)} label="Fat" color={c.fat} />
            <ProgressRing percent={percentOfTarget(n?.carbs ?? 0, targets.carbs)} label="Carbs" color={c.carbs} />
          </View>
        ) : (
          <AppText variant="small">Set your daily targets in Settings to see how this fits.</AppText>
        )}
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
        <View accessibilityRole="radiogroup" accessibilityLabel="Unit" style={styles.chips}>
          {choices.map(({ choice: ch, label }) => (
            <Chip
              key={choiceKey(ch)}
              label={label}
              selected={choiceKey(ch) === choiceKey(choice)}
              onPress={() => switchUnit(ch)}
            />
          ))}
        </View>
        {entry && choice.unit !== 'g' ? <AppText variant="small">= {Math.round(entry.grams)} g</AppText> : null}

        <AppText variant="label">Meal</AppText>
        <Segmented
          accessibilityLabel="Meal"
          value={meal}
          onChange={setMeal}
          options={MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
        />
      </Card>

      <Button title={existing ? 'Save changes' : 'Add to log'} onPress={save} disabled={!entry} />
    </>
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
  stats: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm },
  statCalories: { flex: 1.4 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.md,
  },
  rings: { flexDirection: 'row', justifyContent: 'space-between' },
});
