import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { DayLog } from '@/components/day-log';
import { SyncBanner } from '@/components/sync-banner';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { WeekSummary } from '@/components/week-summary';
import { MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';
import { useProfileState, useToday } from '@/data/data-provider';
import { addDays, formatDayLabel, fromDateKey, isDateKey, type DateKey } from '@/lib/dates';

/** The food log for any day. The day lives in the URL (?date=YYYY-MM-DD) so reloads and links keep it. */
export default function LogScreen() {
  const c = useColors();
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const date: DateKey = isDateKey(params.date) && params.date <= today ? params.date : today;
  const isToday = date === today;
  const { ready, profile } = useProfileState();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const goTo = (d: DateKey) => router.setParams({ date: d >= today ? undefined : d });

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => goTo(addDays(date, -1))}
          style={styles.navBtn}>
          <Ionicons name="chevron-back" size={26} color={c.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${formatDayLabel(date, today)}. Open calendar`}
          onPress={() => setCalendarOpen(true)}
          style={({ pressed }) => [styles.title, { opacity: pressed ? 0.6 : 1 }]}>
          <AppText variant="title">{formatDayLabel(date, today)}</AppText>
          <View style={styles.subtitle}>
            <Ionicons name="calendar-outline" size={16} color={c.primary} />
            <AppText variant="muted">
              {fromDateKey(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: isToday }}
          disabled={isToday}
          onPress={() => goTo(addDays(date, 1))}
          style={[styles.navBtn, isToday && styles.disabled]}>
          <Ionicons name="chevron-forward" size={26} color={c.primary} />
        </Pressable>
      </View>

      {!isToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to today"
          onPress={() => goTo(today)}
          style={[styles.todayChip, { backgroundColor: c.primarySoft }]}>
          <Ionicons name="return-down-back" size={16} color={c.primary} />
          <AppText variant="label" style={{ color: c.primary }}>
            Today
          </AppText>
        </Pressable>
      ) : null}

      <SyncBanner />

      {ready && !profile?.targets ? (
        <Card>
          <AppText variant="heading">Set your targets</AppText>
          <AppText variant="muted">
            Enter your stats and goal and we’ll calculate daily calorie and macro targets.
          </AppText>
          <Button title="Set up targets" onPress={() => router.navigate('/settings')} />
        </Card>
      ) : null}

      <DayLog date={date} />
      <WeekSummary date={date} today={today} />

      {calendarOpen ? (
        <CalendarSheet selected={date} today={today} onSelect={goTo} onClose={() => setCalendarOpen(false)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  title: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  navBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  todayChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: MIN_TOUCH - 8,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    marginTop: -Space.sm,
  },
});
