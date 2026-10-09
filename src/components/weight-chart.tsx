import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Space, useColors } from '@/constants/theme';
import type { RangeKey, WeighIn } from '@/lib/bodyweight';
import { formatDayLabel, type DateKey } from '@/lib/dates';
import { weightUnitLabel } from '@/lib/format';
import { buildWeightChart, nearestDot, type ChartBox } from '@/lib/weight-chart';

import { AppText } from './ui';

const HEIGHT = 220;
const PAD = { left: 40, right: 12, top: 12, bottom: 26 };
// SVG text defaults to a serif font on the web; use the system UI font there.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

/** Daily weigh-ins as dots with the 7-day rolling average as a line. Tap to inspect a day. */
export function WeightChart({
  weighIns,
  range,
  today,
  unit,
}: {
  weighIns: readonly WeighIn[];
  range: RangeKey;
  today: DateKey;
  unit: 'metric' | 'imperial';
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<DateKey | null>(null);
  const chartRef = useRef<View>(null);

  const box: ChartBox = { width, height: HEIGHT, ...PAD };
  const chart = width > 0 ? buildWeightChart({ weighIns, range, today, unit, box }) : null;
  const active = chart?.dots.find((d) => d.date === selected) ?? chart?.dots[chart.dots.length - 1] ?? null;
  const u = weightUnitLabel(unit);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  // locationX is relative to whichever SVG shape was hit on web, so measure against the chart itself.
  const onPress = (e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;
    chartRef.current?.measureInWindow((left) => {
      if (chart) setSelected(nearestDot(chart.dots, pageX - left)?.date ?? null);
    });
  };

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {width > 0 && !chart ? (
        <View style={[styles.empty, { height: HEIGHT }]}>
          <AppText variant="muted">No weigh-ins in this range.</AppText>
        </View>
      ) : null}

      {chart && active ? (
        <>
          <View style={styles.readout} accessibilityLiveRegion="polite">
            <AppText variant="label">
              {formatDayLabel(active.date, today)} · {active.value.toFixed(1)} {u}
            </AppText>
            {active.average !== null ? (
              <AppText variant="small">
                7-day avg {active.average.toFixed(1)} {u}
              </AppText>
            ) : null}
          </View>

          <Pressable
            ref={chartRef}
            accessibilityRole="image"
            accessibilityLabel={`Weight chart, ${chart.dots.length} weigh-ins. Tap to inspect a day.`}
            onPress={onPress}>
            <Svg width={width} height={HEIGHT}>
              {chart.yTicks.map((t) => (
                <Line
                  key={`g${t.label}`}
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={t.y}
                  y2={t.y}
                  stroke={c.border}
                  strokeWidth={1}
                />
              ))}
              {chart.yTicks.map((t) => (
                <SvgText
                  key={`y${t.label}`}
                  x={PAD.left - 6}
                  y={t.y + 4}
                  fontSize={11}
                  fontFamily={FONT}
                  fill={c.muted}
                  textAnchor="end">
                  {t.label}
                </SvgText>
              ))}
              {chart.xTicks.map((t, i) => (
                <SvgText
                  key={`x${i}`}
                  x={t.x}
                  y={HEIGHT - 6}
                  fontSize={11}
                  fontFamily={FONT}
                  fill={c.muted}
                  textAnchor={i === 0 ? 'start' : i === chart.xTicks.length - 1 ? 'end' : 'middle'}>
                  {t.label}
                </SvgText>
              ))}

              <Line
                x1={active.x}
                x2={active.x}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke={c.primary}
                strokeOpacity={0.35}
                strokeWidth={1}
              />

              {chart.dots.map((d) => (
                <Circle key={d.date} cx={d.x} cy={d.y} r={3.5} fill={c.muted} fillOpacity={0.7} />
              ))}

              {chart.averagePath ? (
                <Path
                  d={chart.averagePath}
                  stroke={c.primary}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}

              <Circle cx={active.x} cy={active.y} r={6} fill={c.card} stroke={c.primary} strokeWidth={2.5} />
            </Svg>
          </Pressable>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: c.muted }]} />
              <AppText variant="small">Weigh-in</AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.lineSwatch, { backgroundColor: c.primary }]} />
              <AppText variant="small">7-day average</AppText>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: Space.sm },
  empty: { alignItems: 'center', justifyContent: 'center' },
  readout: { minHeight: 40 },
  legend: { flexDirection: 'row', gap: Space.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  lineSwatch: { width: 16, height: 3, borderRadius: 2 },
});
