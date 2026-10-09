// "Get started" checklist on the Log screen for new users. Which steps are done comes from src/lib/onboarding.ts;
// it disappears once the required steps are done or the user hides it.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, Space, useColors } from '@/constants/theme';
import { useProfileState, useRecentFoods, type useOnboardingPrefs } from '@/data/data-provider';
import { mealForTime } from '@/lib/entries';
import { onboardingProgress, onboardingSteps, showOnboarding, type OnboardingStepId } from '@/lib/onboarding';

import { AppText, Button, Card } from './ui';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const standaloneQuery = () => (isWeb() && window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null);

function subscribeInstalled(onChange: () => void) {
  const q = standaloneQuery();
  q?.addEventListener?.('change', onChange);
  return () => q?.removeEventListener?.('change', onChange);
}

function installedSnapshot(): boolean | null {
  if (!isWeb()) return null;
  // iOS Safari reports home-screen apps through navigator.standalone.
  return !!standaloneQuery()?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Whether the web app is running from the home screen (null on native and during static rendering). */
function useInstalled(): boolean | null {
  return useSyncExternalStore(subscribeInstalled, installedSnapshot, () => null);
}

const STEPS: Record<OnboardingStepId, { title: string; detail: string; action: string }> = {
  targets: {
    title: 'Set your daily targets',
    detail: 'Enter your stats and use the suggested calories and macros.',
    action: 'Set up',
  },
  install: {
    title: 'Add the app to your home screen',
    detail: 'Opens full screen like an app, and works offline.',
    action: 'How',
  },
  log: {
    title: 'Log your first meal',
    detail: 'Search, scan a barcode, or add your own food or recipe.',
    action: 'Add food',
  },
  assistant: {
    title: 'Log by chatting (optional)',
    detail: 'Connect Claude or Meta Muse and just say what you ate.',
    action: 'How',
  },
};

/** `onboarding` is the screen's useOnboardingPrefs(), shared so hiding the card updates the screen too. */
export function GettingStarted({ onboarding }: { onboarding: ReturnType<typeof useOnboardingPrefs> }) {
  const c = useColors();
  const { ready: profileReady, profile } = useProfileState();
  const hasLoggedFood = useRecentFoods(1).length > 0;
  const installed = useInstalled();
  const { ready, prefs, update } = onboarding;

  const facts = {
    hasTargets: !!profile?.targets,
    installed,
    hasLoggedFood,
    assistantSeen: prefs.assistantSeen,
    dismissed: prefs.dismissed,
  };
  // Wait for the device data so the card doesn't flash for someone who's already set up.
  if (!ready || !profileReady || !showOnboarding(facts)) {
    return null;
  }
  const { done, total } = onboardingProgress(facts);

  const act = (id: OnboardingStepId) => {
    switch (id) {
      case 'targets':
        return router.navigate('/settings');
      case 'install':
        return router.push('/guide?section=install');
      case 'log':
        return router.push({ pathname: '/add', params: { meal: mealForTime(new Date().getHours()) } });
      case 'assistant':
        update({ assistantSeen: true });
        return router.push('/guide?section=assistant');
    }
  };

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="heading">Get started</AppText>
        <AppText variant="small">
          {done} of {total} done
        </AppText>
      </View>
      {onboardingSteps(facts).map((step) => {
        const s = STEPS[step.id];
        return (
          <View key={step.id} style={[styles.row, { borderTopColor: c.border }]}>
            <Ionicons
              name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={step.done ? c.primary : c.muted}
              accessibilityLabel={step.done ? 'Done' : 'Not done yet'}
            />
            <View style={styles.flex}>
              <AppText variant="label" style={step.done ? { color: c.muted } : undefined}>
                {s.title}
              </AppText>
              {step.done ? null : <AppText variant="small">{s.detail}</AppText>}
            </View>
            {step.done ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${s.action}: ${s.title}`}
                onPress={() => act(step.id)}
                style={({ pressed }) => [styles.action, { backgroundColor: c.primarySoft, opacity: pressed ? 0.6 : 1 }]}>
                <AppText variant="label" style={{ color: c.primary }}>
                  {s.action}
                </AppText>
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={styles.footer}>
        <Button title="Quick-start guide" variant="ghost" onPress={() => router.push('/guide')} style={styles.wide} />
        <Button title="Hide" variant="ghost" onPress={() => update({ dismissed: true })} style={styles.flex} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Space.sm,
    minHeight: MIN_TOUCH + 8,
  },
  flex: { flex: 1 },
  action: {
    minHeight: MIN_TOUCH - 4,
    minWidth: MIN_TOUCH + 16,
    paddingHorizontal: Space.md,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', gap: Space.sm },
  wide: { flex: 2 },
});
