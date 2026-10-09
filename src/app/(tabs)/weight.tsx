import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { WeightCalendarSheet } from '@/components/calendar-sheet';
import { SyncBanner } from '@/components/sync-banner';
import { AppText, Banner, Button, Card, Field, Screen } from '@/components/ui';
import { MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';
import { useProfileState, useToday, useWeighIns, useWeightStore } from '@/data/data-provider';
import { groupByWeek, parseWeightInput, weekOverWeek, type WeighIn } from '@/lib/bodyweight';
import { formatDayLabel, formatWeekRange, fromDateKey, type DateKey } from '@/lib/dates';
import { formatWeight, formatWeightChange, formatWeightNumber, weightUnitLabel } from '@/lib/format';

export default function WeightScreen() {
  const c = useColors();
  const today = useToday();
  const store = useWeightStore();
  const { weighIns, ready } = useWeighIns();
  const { profile } = useProfileState();
  const unit = profile?.unitSystem ?? 'imperial';
  const scrollRef = useRef<ScrollView>(null);

  // ----- Entry form -----
  const [date, setDate] = useState<DateKey>(today);
  const [weightText, setWeightText] = useState('');
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<DateKey | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const existing = weighIns.find((w) => w.date === date) ?? null;

  // Pre-fill from the saved weigh-in for the chosen day (when it loads or the day changes), unless mid-edit.
  const prefillKey = `${date}|${existing?.weightKg ?? ''}|${existing?.note ?? ''}|${unit}`;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (prefilledFor !== prefillKey && !dirty) {
    setPrefilledFor(prefillKey);
    setWeightText(existing ? formatWeightNumber(existing.weightKg, unit) : '');
    setNote(existing?.note ?? '');
  }

  const chooseDate = (d: DateKey) => {
    setDate(d);
    setDirty(false);
    setError(null);
    setSavedFor(null);
  };

  const edit = (w: WeighIn) => {
    chooseDate(w.date);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const save = () => {
    const weightKg = parseWeightInput(weightText, unit);
    if (weightKg === null) {
      setError(`Enter a weight between ${unit === 'imperial' ? '45 and 880 lb' : '20 and 400 kg'}.`);
      return;
    }
    store.save({ date, weightKg, note: note.trim() || null });
    setError(null);
    setDirty(false);
    setSavedFor(date);
  };

  // ----- Summary + history -----
  const { current, previous, changeKg } = weekOverWeek(weighIns, today);
  const weeks = groupByWeek(weighIns.filter((w) => w.date <= today));

  return (
    <Screen scrollRef={scrollRef}>
      <AppText variant="title">Weight</AppText>
      <SyncBanner />

      <Card>
        <AppText variant="label">This week</AppText>
        {current ? (
          <>
            <View style={styles.bigRow}>
              <AppText style={styles.big}>{formatWeightNumber(current.averageKg, unit)}</AppText>
              <AppText variant="muted">{weightUnitLabel(unit)} average</AppText>
            </View>
            <AppText variant="small">
              {current.count} weigh-in{current.count === 1 ? '' : 's'} · {formatWeekRange(current.weekStart)}
            </AppText>
          </>
        ) : (
          <AppText variant="muted">No weigh-ins this week yet.</AppText>
        )}
        {changeKg !== null && previous ? (
          <View style={styles.changeRow}>
            <Ionicons
              name={changeKg < 0 ? 'trending-down' : changeKg > 0 ? 'trending-up' : 'remove-outline'}
              size={18}
              color={c.muted}
            />
            <AppText variant="body">
              {formatWeightChange(changeKg, unit)}{' '}
              <AppText variant="small">vs {formatWeekRange(previous.weekStart)}</AppText>
            </AppText>
          </View>
        ) : previous ? (
          <AppText variant="small">
            Last logged week ({formatWeekRange(previous.weekStart)}): {formatWeight(previous.averageKg, unit)} average
          </AppText>
        ) : null}
      </Card>

      <Card>
        <AppText variant="heading">{existing ? 'Update weigh-in' : 'Log weigh-in'}</AppText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Date: ${formatDayLabel(date, today)}. Change date`}
          onPress={() => setCalendarOpen(true)}
          style={[styles.dateRow, { borderColor: c.border, backgroundColor: c.background }]}>
          <Ionicons name="calendar-outline" size={18} color={c.primary} />
          <AppText style={styles.flex}>
            {formatDayLabel(date, today)}
            {date !== today ? (
              <AppText variant="small">
                {' '}
                · {fromDateKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </AppText>
            ) : null}
          </AppText>
          <Ionicons name="chevron-down" size={18} color={c.muted} />
        </Pressable>

        <Field
          label="Weight"
          value={weightText}
          onChangeText={(t) => {
            setWeightText(t);
            setDirty(true);
            setSavedFor(null);
          }}
          keyboardType="decimal-pad"
          suffix={weightUnitLabel(unit)}
          placeholder={unit === 'imperial' ? 'e.g. 180.4' : 'e.g. 81.8'}
          error={error}
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={(t) => {
            setNote(t);
            setDirty(true);
            setSavedFor(null);
          }}
          placeholder="e.g. after a long run"
          maxLength={280}
        />

        {savedFor === date ? <Banner tone="info">Saved for {formatDayLabel(date, today).toLowerCase()}.</Banner> : null}
        <Button title={existing ? 'Update weigh-in' : 'Save weigh-in'} onPress={save} />
        {date !== today ? <Button title="Back to today" variant="ghost" onPress={() => chooseDate(today)} /> : null}
      </Card>

      <AppText variant="heading">History</AppText>
      {ready && weeks.length === 0 ? (
        <Card>
          <AppText variant="muted">No weigh-ins yet. Log your first one above — weekly averages appear here.</AppText>
        </Card>
      ) : null}
      {weeks.map((week) => (
        <Card key={week.weekStart} style={styles.week}>
          <View style={styles.weekHeader}>
            <AppText variant="label">{formatWeekRange(week.weekStart)}</AppText>
            <AppText variant="label">
              {formatWeight(week.averageKg, unit)} <AppText variant="small">avg · {week.count}</AppText>
            </AppText>
          </View>
          {week.entries.map((w) => (
            <View key={w.date} style={[styles.row, { borderTopColor: c.border }]}>
              <View style={styles.flex}>
                <AppText>{formatDayLabel(w.date, today)}</AppText>
                {w.note ? (
                  <AppText variant="small" numberOfLines={2}>
                    {w.note}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="label" style={styles.num}>
                {formatWeight(w.weightKg, unit)}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit weigh-in for ${formatDayLabel(w.date, today)}`}
                onPress={() => edit(w)}
                style={styles.iconBtn}>
                <Ionicons name="pencil-outline" size={20} color={c.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete weigh-in for ${formatDayLabel(w.date, today)}`}
                onPress={() => store.remove(w.date)}
                style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={c.muted} />
              </Pressable>
            </View>
          ))}
        </Card>
      ))}

      {calendarOpen ? (
        <WeightCalendarSheet
          selected={date}
          today={today}
          onSelect={chooseDate}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  big: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
  },
  week: { gap: 0, paddingVertical: Space.md },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: MIN_TOUCH + 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  num: { fontVariant: ['tabular-nums'] },
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
