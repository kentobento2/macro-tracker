// Small set of shared, mobile-first UI primitives.

import type { ReactNode, RefObject } from 'react';
import {
  ActivityIndicator,
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

import { MAX_CONTENT_WIDTH, MIN_TOUCH, Radius, Space, useColors } from '@/constants/theme';

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
  const bg = variant === 'primary' ? c.primary : variant === 'secondary' ? c.primarySoft : 'transparent';
  const fg = variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: c.danger },
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
  ...input
}: TextInputProps & { label?: string; suffix?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={[styles.field, style as StyleProp<ViewStyle>]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={[styles.inputWrap, { borderColor: error ? c.danger : c.border, backgroundColor: c.card }]}>
        <TextInput
          placeholderTextColor={c.muted}
          {...input}
          style={[styles.input, { color: c.text }]}
          accessibilityLabel={input.accessibilityLabel ?? label}
        />
        {suffix ? <AppText variant="muted">{suffix}</AppText> : null}
      </View>
      {error ? <AppText style={{ color: c.danger }} variant="small">{error}</AppText> : null}
    </View>
  );
}

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
            style={[styles.segment, selected && { backgroundColor: c.card }]}>
            <Text style={[styles.segmentText, { color: selected ? c.text : c.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primarySoft : c.card },
      ]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: selected ? c.primary : c.text }]}>
        {label}
      </Text>
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
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Space.lg, gap: Space.md },
  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },
  field: { gap: Space.xs, flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    minHeight: MIN_TOUCH + 4,
    gap: Space.sm,
  },
  // 16px avoids iOS Safari zooming into focused inputs.
  input: { flex: 1, fontSize: 16, paddingVertical: Space.sm, minWidth: 0 },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH - 4,
    borderRadius: Radius.sm + 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xs,
  },
  segmentText: { fontSize: 15, fontWeight: '600' },
  chip: {
    minHeight: MIN_TOUCH - 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipText: { fontSize: 15, fontWeight: '500' },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  banner: { borderRadius: Radius.md, paddingHorizontal: Space.md, paddingVertical: Space.sm + 2 },
  bannerText: { fontSize: 14, fontWeight: '500' },
});

const textStyles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 15 },
  small: { fontSize: 13 },
});
