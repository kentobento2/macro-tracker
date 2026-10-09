import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DayLog } from '@/components/day-log';
import { NutritionSummary } from '@/components/nutrition-summary';
import { SyncBanner } from '@/components/sync-banner';
import { AppText, Screen } from '@/components/ui';
import { MIN_TOUCH, useColors } from '@/constants/theme';
import { useEntries, useProfileState, useToday } from '@/data/data-provider';
import { addDays, daysEnding, formatDayLabel } from '@/lib/dates';
import { averageOverLoggedDays } from '@/lib/entries';

export default function HistoryScreen() {
  const c = useColors();
  const today = useToday();
  const [date, setDate] = useState(() => addDays(today, -1));
  const week = daysEnding(date, 7);
  const { entries } = useEntries(week);
  const { profile } = useProfileState();
  const { average, daysLogged } = averageOverLoggedDays(entries, week);
  const atToday = date >= today;

  return (
    <Screen>
      <AppText variant="title">History</AppText>
      <SyncBanner />

      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => setDate(addDays(date, -1))}
          style={styles.navBtn}>
          <Ionicons name="chevron-back" size={26} color={c.primary} />
        </Pressable>
        <AppText variant="heading">{formatDayLabel(date, today)}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: atToday }}
          disabled={atToday}
          onPress={() => setDate(addDays(date, 1))}
          style={[styles.navBtn, atToday && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={26} color={c.primary} />
        </Pressable>
      </View>

      <NutritionSummary
        title={`7-day average · ${daysLogged} of 7 days logged`}
        consumed={average}
        targets={profile?.targets ?? null}
      />

      <DayLog date={date} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
});
