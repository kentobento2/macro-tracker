import { router } from 'expo-router';
import { View } from 'react-native';

import { DayLog } from '@/components/day-log';
import { SyncBanner } from '@/components/sync-banner';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useProfileState, useToday } from '@/data/data-provider';
import { fromDateKey } from '@/lib/dates';

export default function TodayScreen() {
  const today = useToday();
  const { ready, profile } = useProfileState();

  return (
    <Screen>
      <View>
        <AppText variant="title">Today</AppText>
        <AppText variant="muted">
          {fromDateKey(today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </AppText>
      </View>
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
      <DayLog date={today} />
    </Screen>
  );
}
