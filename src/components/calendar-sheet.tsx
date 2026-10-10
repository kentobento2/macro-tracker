import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Font, MAX_CONTENT_WIDTH, MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';
import { useDatesWithEntries, useWeighIns } from '@/data/data-provider';
import { addMonths, daysInMonth, formatMonth, monthGrid, monthOf, WEEKDAY_LABELS, type MonthKey } from '@/lib/calendar';
import { fromDateKey, type DateKey } from '@/lib/dates';

import { AppText, Button } from './ui';

type SheetProps = {
  selected: DateKey;
  today: DateKey;
  onSelect: (d: DateKey) => void;
  onClose: () => void;
};

/** Calendar with dots on days that have food logged. */
export function FoodCalendarSheet(props: SheetProps) {
  const [month, setMonth] = useState<MonthKey>(() => monthOf(props.selected));
  const marked = useDatesWithEntries(daysInMonth(month));
  return <CalendarSheet {...props} month={month} onMonthChange={setMonth} marked={marked} legend="Food logged" />;
}

/** Calendar with dots on days that have a weigh-in. */
export function WeightCalendarSheet(props: SheetProps) {
  const [month, setMonth] = useState<MonthKey>(() => monthOf(props.selected));
  const { weighIns } = useWeighIns();
  const marked = new Set(weighIns.map((w) => w.date));
  return <CalendarSheet {...props} month={month} onMonthChange={setMonth} marked={marked} legend="Weighed in" />;
}

/** Month calendar in a bottom sheet. Marked days get a dot; future days are disabled. */
function CalendarSheet({
  selected,
  today,
  onSelect,
  onClose,
  month,
  onMonthChange: setMonth,
  marked: logged,
  legend,
}: SheetProps & {
  month: MonthKey;
  onMonthChange: (m: MonthKey) => void;
  marked: ReadonlySet<DateKey>;
  legend: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const atCurrentMonth = month >= monthOf(today);

  const pick = (d: DateKey) => {
    onSelect(d);
    onClose();
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close calendar" style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: c.card, borderColor: c.border, paddingBottom: Space.lg + insets.bottom },
        ]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => setMonth(addMonths(month, -1))}
            style={styles.navBtn}>
            <Ionicons name="chevron-back" size={24} color={c.primary} />
          </Pressable>
          <AppText variant="heading" accessibilityRole="header">
            {formatMonth(month)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: atCurrentMonth }}
            disabled={atCurrentMonth}
            onPress={() => setMonth(addMonths(month, 1))}
            style={[styles.navBtn, atCurrentMonth && styles.disabled]}>
            <Ionicons name="chevron-forward" size={24} color={c.primary} />
          </Pressable>
        </View>

        <View style={styles.row}>
          {WEEKDAY_LABELS.map((d, i) => (
            <Text key={i} style={[styles.weekday, { color: c.muted }]}>
              {d}
            </Text>
          ))}
        </View>

        {monthGrid(month).map((week) => (
          <View key={week[0].date} style={styles.row}>
            {week.map(({ date, inMonth }) => {
              const isSelected = date === selected;
              const isToday = date === today;
              const isFuture = date > today;
              const hasEntries = logged.has(date);
              const label = [
                fromDateKey(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                isToday ? 'today' : null,
                isSelected ? 'selected' : null,
                hasEntries ? legend.toLowerCase() : null,
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isSelected, disabled: isFuture }}
                  disabled={isFuture}
                  onPress={() => pick(date)}
                  style={styles.cell}>
                  <View
                    style={[
                      styles.day,
                      isSelected && { backgroundColor: c.primary },
                      isToday && !isSelected && { borderWidth: 1.5, borderColor: c.primary },
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        { color: isSelected ? c.onPrimary : inMonth ? c.text : c.muted },
                        isFuture && styles.future,
                      ]}>
                      {Number(date.slice(8))}
                    </Text>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: hasEntries ? (isSelected ? c.onPrimary : c.primary) : 'transparent' },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: c.primary }]} />
          <AppText variant="small">{legend}</AppText>
        </View>

        <View style={styles.actions}>
          <Button title="Close" variant="secondary" onPress={onClose} style={styles.flex} />
          <Button title="Today" onPress={() => pick(today)} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30, 22, 15, 0.4)' },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    borderTopLeftRadius: Radius.lg + 4,
    borderTopRightRadius: Radius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.xs },
  navBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: Font.bold, paddingVertical: Space.xs },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH + 4 },
  day: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  dayText: { fontSize: 16, fontFamily: Font.semibold, fontVariant: ['tabular-nums'] },
  future: { opacity: 0.35 },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, alignSelf: 'center', marginTop: Space.xs },
  actions: { flexDirection: 'row', gap: Space.md, marginTop: Space.sm },
  flex: { flex: 1 },
});
