import { StyleSheet, View } from 'react-native';

import { Space, useColors, type Colors } from '@/constants/theme';
import { formatKcal } from '@/lib/format';
import { progress, remainingNutrition, type Nutrition } from '@/lib/macros';
import type { Targets } from '@/lib/targets';

import { AppText, Card, ProgressBar } from './ui';

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: (c: Colors) => string }[] = [
  { key: 'protein', label: 'Protein', color: (c) => c.protein },
  { key: 'carbs', label: 'Carbs', color: (c) => c.carbs },
  { key: 'fat', label: 'Fat', color: (c) => c.fat },
];

/** Calories and macros vs targets. Without targets, shows totals only. */
export function NutritionSummary({
  consumed,
  targets,
  title,
}: {
  consumed: Nutrition;
  targets: Targets | null;
  title?: string;
}) {
  const c = useColors();
  const left = targets ? remainingNutrition(targets, consumed).calories : null;

  return (
    <Card>
      {title ? <AppText variant="label">{title}</AppText> : null}
      <View style={styles.kcalRow}>
        <View>
          <AppText style={styles.kcal}>{formatKcal(consumed.calories)}</AppText>
          <AppText variant="muted">
            {targets ? `of ${formatKcal(targets.calories)} kcal` : 'kcal'}
          </AppText>
        </View>
        {left !== null ? (
          <View style={styles.right}>
            <AppText style={[styles.leftNum, left < 0 && { color: c.danger }]}>
              {formatKcal(Math.abs(left))}
            </AppText>
            <AppText variant="muted">{left < 0 ? 'kcal over' : 'kcal left'}</AppText>
          </View>
        ) : null}
      </View>
      {targets ? (
        <ProgressBar
          value={progress(consumed.calories, targets.calories)}
          color={c.primary}
          over={consumed.calories > targets.calories}
        />
      ) : null}

      <View style={styles.macros}>
        {MACROS.map((m) => (
          <View key={m.key} style={styles.macro}>
            <AppText variant="small">{m.label}</AppText>
            <AppText variant="label">
              {Math.round(consumed[m.key])}
              {targets ? <AppText variant="small"> / {targets[m.key]}g</AppText> : 'g'}
            </AppText>
            {targets ? <ProgressBar value={progress(consumed[m.key], targets[m.key])} color={m.color(c)} /> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  kcalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kcal: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  right: { alignItems: 'flex-end' },
  leftNum: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  macros: { flexDirection: 'row', gap: Space.md, marginTop: Space.xs },
  macro: { flex: 1, gap: Space.xs },
});
