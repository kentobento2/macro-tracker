// Shared, mobile-first UI primitives. Visual language: light background, white rounded cards,
// big bold numbers with small colored % pills, pill toggles, and a dark primary button.

import { useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MAX_CONTENT_WIDTH, MIN_TOUCH, Radius, Space, tint, useColors } from '@/constants/theme';

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const c = useColors();
  const inner = <View style={styles.column}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: c.background }]}>
      {scroll ? (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

type Variant = 'title' | 'heading' | 'body' | 'label' | 'muted' | 'small';

export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const c = useColors();
  const color = variant === 'muted' || variant === 'small' ? c.muted : c.text;
  return <Text {...rest} style={[textStyles[variant], { color }, style]} />;
}

/** Bold section heading, e.g. "Impact on Targets". */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <AppText variant="heading" accessibilityRole="header">
      {children}
    </AppText>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const bg = { primary: c.ink, secondary: c.track, ghost: 'transparent', danger: c.dangerSoft }[variant];
  const fg = { primary: c.onInk, secondary: c.text, ghost: c.primary, danger: c.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  suffix,
  error,
  style,
  onFocus,
  onBlur,
  ...input
}: TextInputProps & { label?: string; suffix?: string; error?: string | null }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const border = error ? c.danger : focused ? c.ink : c.border;
  return (
    <View style={[styles.field, style as StyleProp<ViewStyle>]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={[styles.inputWrap, { borderColor: border, backgroundColor: c.card }]}>
        <TextInput
          placeholderTextColor={c.muted}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: c.text }, webNoOutline]}
          accessibilityLabel={input.accessibilityLabel ?? label}
        />
        {suffix ? <AppText variant="muted">{suffix}</AppText> : null}
      </View>
      {error ? (
        <AppText style={{ color: c.danger }} variant="small">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Pill-shaped segmented toggle; the selected option is a dark pill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: c.track }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: c.ink }]}>
            <Text numberOfLines={1} style={[styles.segmentText, { color: selected ? c.onInk : c.muted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Single selectable pill (wraps in rows). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? c.ink : c.track }]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: selected ? c.onInk : c.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small colored percentage pill, e.g. "48%". */
export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: tint(color, 0.18) }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/** A big number with a label under it and an optional colored % pill above it. */
export function StatColumn({
  value,
  label,
  pill,
  color,
  size = 'md',
  align = 'center',
}: {
  value: string;
  label: string;
  pill?: string | null;
  color: string;
  size?: 'md' | 'lg';
  align?: 'center' | 'start';
}) {
  const c = useColors();
  return (
    <View style={[styles.stat, { alignItems: align === 'center' ? 'center' : 'flex-start' }]}>
      {size === 'md' ? <View style={styles.pillSlot}>{pill ? <Pill text={pill} color={color} /> : null}</View> : null}
      <Text
        numberOfLines={1}
        style={[size === 'lg' ? (value.length > 4 ? styles.statLgLong : styles.statLg) : styles.statMd, { color: c.text }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

/** Circular progress ring with the percentage in the middle and a label below. */
export function ProgressRing({
  percent,
  label,
  color,
  size = 64,
  stroke = 5,
}: {
  percent: number;
  label: string;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.ring} accessible accessibilityLabel={`${label}: ${percent}% of daily target`}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
          {shown > 0 ? (
            // Skipped at 0%: a round line cap would still draw a dot.
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
            />
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
          <Text style={[styles.ringText, { color: c.text }]}>{percent}%</Text>
        </View>
      </View>
      <Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

/** Horizontal value-vs-target bar with a marker line at the target (see `targetBar` in lib/macros). */
export function TargetBar({ fill, marker, color }: { fill: number; marker: number; color: string }) {
  const c = useColors();
  return (
    <View style={[styles.targetTrack, { backgroundColor: tint(color, 0.16) }]}>
      <View style={[styles.targetFill, { width: `${Math.min(1, fill) * 100}%`, backgroundColor: color }]} />
      {marker > 0 ? (
        <View style={[styles.targetMarker, { left: `${marker * 100}%`, backgroundColor: c.text }]} />
      ) : null}
    </View>
  );
}

/** Icon-over-label action button for action rows (Favorite, Duplicate, Delete…). */
export function ActionButton({
  icon,
  label,
  onPress,
  active,
  tone = 'default',
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  tone?: 'default' | 'danger';
}) {
  const c = useColors();
  const fg = tone === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={[styles.actionIcon, { backgroundColor: active ? tint(c.fat, 0.2) : c.track }]}>
        <Ionicons name={icon} size={20} color={active ? c.fat : fg} />
      </View>
      <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, color, over }: { value: number; color: string; over?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.track, { backgroundColor: c.track }]}>
      <View
        style={[styles.fill, { width: `${Math.round(value * 100)}%`, backgroundColor: over ? c.danger : color }]}
      />
    </View>
  );
}

export function Banner({ tone = 'warning', children }: { tone?: 'warning' | 'info'; children: ReactNode }) {
  const c = useColors();
  const bg = tone === 'warning' ? c.warningSoft : c.primarySoft;
  const fg = tone === 'warning' ? c.warning : c.primary;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Text style={[styles.bannerText, { color: fg }]}>{children}</Text>
    </View>
  );
}

// Focus is shown by the field border instead of the browser's default outline.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  column: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: Space.lg,
    paddingBottom: Space.xl * 2,
    gap: Space.lg,
    flexGrow: 1,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.md,
    boxShadow: '0 1px 3px rgba(16, 24, 40, 0.06)',
  },
  button: {
    minHeight: MIN_TOUCH + 6,
    borderRadius: Radius.md + 2,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: { gap: Space.xs, flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    minHeight: MIN_TOUCH + 6,
    gap: Space.sm,
  },
  // 16px avoids iOS Safari zooming into focused inputs.
  input: { flex: 1, fontSize: 16, paddingVertical: Space.sm, minWidth: 0 },
  segmented: { flexDirection: 'row', borderRadius: Radius.pill, padding: 4 },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - 4,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
  },
  segmentText: { fontSize: 15, fontWeight: '600' },
  chip: {
    minHeight: MIN_TOUCH - 4,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.lg,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pillSlot: { height: 22, justifyContent: 'center' },
  stat: { flex: 1, minWidth: 0 },
  statLg: { fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  // Step down for long values like "1,320" so they fit beside three macro columns on narrow phones.
  statLgLong: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statMd: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, marginTop: 2 },
  ring: { alignItems: 'center', flex: 1, gap: Space.xs },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  targetTrack: { height: 10, borderRadius: Radius.pill, overflow: 'visible', justifyContent: 'center' },
  targetFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: Radius.pill },
  targetMarker: { position: 'absolute', width: 2, height: 16, marginLeft: -1, borderRadius: 1 },
  action: { alignItems: 'center', gap: Space.xs, minWidth: 64, paddingVertical: 2 },
  actionIcon: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '500' },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  banner: { borderRadius: Radius.md, paddingHorizontal: Space.md, paddingVertical: Space.sm + 2 },
  bannerText: { fontSize: 14, fontWeight: '500' },
});

const textStyles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 15 },
  small: { fontSize: 13 },
});
