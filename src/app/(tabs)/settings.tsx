import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiTokensCard } from '@/components/api-tokens-card';
import { SyncBanner } from '@/components/sync-banner';
import { AppText, Banner, Button, Card, Field, Screen, Segmented } from '@/components/ui';
import { MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';
import { signOut, useAuth } from '@/data/auth';
import { useClearLocalData, useProfileState, useProfileStore, useSyncStatus } from '@/data/data-provider';
import { caloriesFromMacros } from '@/lib/macros';
import {
  convertFormUnits,
  formFromProfile,
  parseNumber,
  profileFromForm,
  statsFromForm,
  targetsToForm,
  type FormErrors,
  type SettingsForm,
} from '@/lib/settings-form';
import { computeTargets, type ActivityLevel } from '@/lib/targets';

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk job, little exercise' },
  { value: 'light', label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'Very active', hint: 'Exercise 6–7 days a week' },
  { value: 'very_active', label: 'Extremely active', hint: 'Hard training or a physical job' },
];

export default function SettingsScreen() {
  const c = useColors();
  const { session } = useAuth();
  const store = useProfileStore();
  const { profile, pending } = useProfileState();
  const { pendingCount } = useSyncStatus();
  const clearLocal = useClearLocalData();

  const [form, setForm] = useState<SettingsForm>(() => formFromProfile(profile));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // When the stored profile changes (loaded from device, then server), show it — unless the user is mid-edit.
  const [shownProfile, setShownProfile] = useState(profile);
  if (profile !== shownProfile) {
    setShownProfile(profile);
    if (!dirty) setForm(formFromProfile(profile));
  }

  const update = (patch: Partial<SettingsForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setSaved(false);
  };

  const suggested = useMemo(() => {
    const stats = statsFromForm(form);
    return stats ? computeTargets(stats) : null;
  }, [form]);

  const macroKcal = (() => {
    const [p, cb, f] = [parseNumber(form.protein), parseNumber(form.carbs), parseNumber(form.fat)];
    return p !== null && cb !== null && f !== null ? Math.round(caloriesFromMacros({ protein: p, carbs: cb, fat: f })) : null;
  })();

  const save = () => {
    const result = profileFromForm(form);
    setErrors(result.errors);
    if (result.profile) {
      store.save(result.profile);
      setDirty(false);
      setSaved(true);
    }
  };

  const doSignOut = async () => {
    await clearLocal();
    await signOut();
  };

  const imperial = form.unitSystem === 'imperial';

  return (
    <Screen>
      <AppText variant="title">Settings</AppText>
      <SyncBanner />

      <Card>
        <AppText variant="heading">About you</AppText>
        <AppText variant="small">Used to calculate your suggested targets.</AppText>

        <AppText variant="label">Units</AppText>
        <Segmented
          accessibilityLabel="Units"
          value={form.unitSystem}
          onChange={(u) => {
            setForm((f) => convertFormUnits(f, u));
            setDirty(true);
            setSaved(false);
          }}
          options={[
            { value: 'imperial', label: 'lb / ft' },
            { value: 'metric', label: 'kg / cm' },
          ]}
        />

        <AppText variant="label">Sex (for the calorie formula)</AppText>
        <Segmented
          accessibilityLabel="Sex"
          value={form.sex}
          onChange={(sex) => update({ sex })}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
        />
        {errors.sex ? <ErrorText text={errors.sex} /> : null}

        <View style={styles.row}>
          <Field
            label="Age"
            value={form.age}
            onChangeText={(age) => update({ age })}
            keyboardType="number-pad"
            suffix="yrs"
            error={errors.age}
          />
          <Field
            label="Weight"
            value={form.weight}
            onChangeText={(weight) => update({ weight })}
            keyboardType="decimal-pad"
            suffix={imperial ? 'lb' : 'kg'}
            error={errors.weight}
          />
        </View>

        {imperial ? (
          <View style={styles.row}>
            <Field
              label="Height"
              value={form.heightFt}
              onChangeText={(heightFt) => update({ heightFt })}
              keyboardType="number-pad"
              suffix="ft"
              accessibilityLabel="Height, feet"
            />
            <Field
              label=" "
              value={form.heightIn}
              onChangeText={(heightIn) => update({ heightIn })}
              keyboardType="number-pad"
              suffix="in"
              accessibilityLabel="Height, inches"
            />
          </View>
        ) : (
          <Field
            label="Height"
            value={form.heightCm}
            onChangeText={(heightCm) => update({ heightCm })}
            keyboardType="decimal-pad"
            suffix="cm"
          />
        )}
        {errors.height ? <ErrorText text={errors.height} /> : null}

        <AppText variant="label">Activity level</AppText>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {ACTIVITY_OPTIONS.map((o) => {
            const selected = form.activityLevel === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => update({ activityLevel: o.value })}
                style={[
                  styles.option,
                  { borderColor: selected ? c.ink : c.border, backgroundColor: selected ? c.track : c.card },
                ]}>
                <AppText variant="label">
                  {o.label}
                </AppText>
                <AppText variant="small">{o.hint}</AppText>
              </Pressable>
            );
          })}
        </View>
        {errors.activityLevel ? <ErrorText text={errors.activityLevel} /> : null}

        <AppText variant="label">Goal</AppText>
        <Segmented
          accessibilityLabel="Goal"
          value={form.goal}
          onChange={(goal) => update({ goal })}
          options={[
            { value: 'lose', label: 'Lose' },
            { value: 'maintain', label: 'Maintain' },
            { value: 'gain', label: 'Gain' },
          ]}
        />
        {errors.goal ? <ErrorText text={errors.goal} /> : null}
      </Card>

      <Card>
        <AppText variant="heading">Daily targets</AppText>
        {suggested ? (
          <View style={[styles.suggested, { backgroundColor: c.primarySoft }]}>
            <AppText variant="label" style={{ color: c.primary }}>
              Suggested: {suggested.calories} kcal · P {suggested.protein}g · C {suggested.carbs}g · F {suggested.fat}g
            </AppText>
            <Button title="Use suggested targets" variant="ghost" onPress={() => update(targetsToForm(suggested))} />
          </View>
        ) : (
          <AppText variant="small">Fill in everything above to get suggested targets, or enter your own.</AppText>
        )}

        <Field
          label="Calories"
          value={form.calories}
          onChangeText={(calories) => update({ calories })}
          keyboardType="number-pad"
          suffix="kcal"
          error={errors.calories}
        />
        <View style={styles.row}>
          <Field
            label="Protein"
            value={form.protein}
            onChangeText={(protein) => update({ protein })}
            keyboardType="number-pad"
            suffix="g"
            error={errors.protein}
          />
          <Field
            label="Carbs"
            value={form.carbs}
            onChangeText={(carbs) => update({ carbs })}
            keyboardType="number-pad"
            suffix="g"
            error={errors.carbs}
          />
          <Field
            label="Fat"
            value={form.fat}
            onChangeText={(fat) => update({ fat })}
            keyboardType="number-pad"
            suffix="g"
            error={errors.fat}
          />
        </View>
        {macroKcal !== null ? <AppText variant="small">These macros add up to {macroKcal} kcal.</AppText> : null}
      </Card>

      {saved ? (
        <Banner tone="info">{pending ? 'Saved on this device. It will sync when you’re back online.' : 'Saved.'}</Banner>
      ) : null}
      {Object.keys(errors).length ? <Banner>Fix the highlighted fields.</Banner> : null}
      <Button title="Save" onPress={save} />

      <ApiTokensCard />

      <Card>
        <AppText variant="heading">Account</AppText>
        <AppText variant="muted">Signed in as {session?.user.email ?? 'unknown'}</AppText>
        {confirmSignOut ? (
          <>
            {pendingCount ? (
              <Banner>
                {pendingCount} change{pendingCount === 1 ? ' has' : 's have'} not synced yet and will be lost if you sign out now.
              </Banner>
            ) : null}
            <View style={styles.row}>
              <Button title="Cancel" variant="secondary" onPress={() => setConfirmSignOut(false)} style={styles.flex} />
              <Button title="Sign out" variant="danger" onPress={doSignOut} style={styles.flex} />
            </View>
          </>
        ) : (
          <Button title="Sign out" variant="secondary" onPress={() => setConfirmSignOut(true)} />
        )}
      </Card>
    </Screen>
  );
}

function ErrorText({ text }: { text: string }) {
  const c = useColors();
  return (
    <AppText variant="small" style={{ color: c.danger }}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.md },
  flex: { flex: 1 },
  options: { gap: Space.sm },
  option: { borderWidth: 1, borderRadius: Radius.md, padding: Space.md, minHeight: MIN_TOUCH, gap: 2 },
  suggested: { borderRadius: Radius.md, padding: Space.md, gap: Space.xs },
});
