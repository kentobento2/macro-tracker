import { StyleSheet, View } from 'react-native';

import { Space, useColors, type Colors } from '@/constants/theme';
import { formatKcal } from '@/lib/format';
import { macroCaloriePercents, percentOfTarget, targetBar, type Nutrition } from '@/lib/macros';
import type { Targets } from '@/lib/targets';

import { AppText, Card, StatColumn, TargetBar } from './ui';

type Key = 'calories' | 'protein' | 'fat' | 'carbs';

const ROWS: { key: Key; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
];

const colorOf = (c: Colors, k: Key) => c[k];

/**
 * Big calories number with protein/fat/carbs beside it. Pills show % of daily target (or each macro's share of
 * calories when no targets are set). With targets, value-vs-target bars with a marker follow.
 */
export function NutritionSummary({
  consumed,
  targets,
  title,
  bars = true,
}: {
  consumed: Nutrition;
  targets: Targets | null;
  title?: string;
  /** Show value-vs-target bars under the numbers. */
  bars?: boolean;
}) {
  const c = useColors();
  const split = macroCaloriePercents(consumed);
  const pill = (k: Exclude<Key, 'calories'>) =>
    targets ? `${percentOfTarget(consumed[k], targets[k])}%` : consumed.calories > 0 ? `${split[k]}%` : null;

  return (
    <Card>
      {title ? <AppText variant="label">{title}</AppText> : null}
      <View style={styles.stats}>
        <View style={styles.calories}>
          <StatColumn
            size="lg"
            align="start"
            value={formatKcal(consumed.calories)}
            label={targets ? `of ${formatKcal(targets.calories)} kcal` : 'Calories'}
            color={c.calories}
          />
        </View>
        {(['protein', 'fat', 'carbs'] as const).map((k) => (
          <StatColumn
            key={k}
            value={String(Math.round(consumed[k]))}
            label={k === 'protein' ? 'Protein' : k === 'fat' ? 'Fat' : 'Carbs'}
            pill={pill(k)}
            color={colorOf(c, k)}
          />
        ))}
      </View>

      {targets && bars ? (
        <View style={styles.bars}>
          {ROWS.map(({ key, label, unit }) => {
            const value = consumed[key];
            const target = targets[key];
            const bar = targetBar(value, target);
            const left = target - value;
            const fmt = (n: number) => `${formatKcal(n)}${unit}`;
            return (
              <View key={key} style={styles.barRow}>
                <View style={styles.barHead}>
                  <AppText variant="label">{label}</AppText>
                  <AppText variant="small" style={styles.num}>
                    {fmt(value)} / {fmt(target)}
                    {'  ·  '}
                    <AppText variant="small" style={bar.over ? { color: c.danger } : undefined}>
                      {left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`}
                    </AppText>
                  </AppText>
                </View>
                <TargetBar fill={bar.fill} marker={bar.marker} color={colorOf(c, key)} />
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm },
  calories: { flex: 1.5 },
  bars: { gap: Space.md, marginTop: Space.xs },
  barRow: { gap: 6 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Space.sm },
  num: { fontVariant: ['tabular-nums'] },
});
