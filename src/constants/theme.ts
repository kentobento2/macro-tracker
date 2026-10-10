import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

// Warm, cozy palette: oat background, cream cards, espresso ink, earthy nutrient colors.
// One color per nutrient, used on every screen (numbers, pills, rings, bars, chart). Every text color here
// reaches 4.5:1 on `card`.
const light = {
  background: '#F7F2EA',
  card: '#FFFDF9',
  text: '#2E2925',
  muted: '#756C63',
  border: '#ECE4D9',
  track: '#F2ECE3',
  // Accent for progress, selection and links (sage).
  primary: '#3F7A56',
  onPrimary: '#FFFFFF',
  primarySoft: '#E4EEE4',
  // Dark primary action button and selected pills (espresso).
  ink: '#2E2925',
  onInk: '#FFFDF9',
  danger: '#B04436',
  dangerSoft: '#F8E7E2',
  warning: '#8A5A12',
  warningSoft: '#FBF0D9',
  calories: '#3F7A56',
  protein: '#4469AD',
  carbs: '#9C6512',
  fat: '#B24A66',
  // Soft drop shadow under cards and the tab bar.
  shadow: '0 1px 2px rgba(74, 52, 30, 0.04), 0 6px 18px rgba(74, 52, 30, 0.06)',
};

const dark: typeof light = {
  background: '#171412',
  card: '#231F1B',
  text: '#F3ECE4',
  muted: '#AFA59A',
  border: '#332D27',
  track: '#2F2924',
  primary: '#8CC7A0',
  onPrimary: '#14261A',
  primarySoft: '#23332A',
  ink: '#F3ECE4',
  onInk: '#171412',
  danger: '#F08C7E',
  dangerSoft: '#3A2320',
  warning: '#E9C072',
  warningSoft: '#33281A',
  calories: '#8CC7A0',
  protein: '#94B2EA',
  carbs: '#E7B460',
  fat: '#EE97AB',
  shadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
};

export type Colors = typeof light;
export type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat';

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Translucent tint of a hex color, for pill backgrounds. */
export function tint(hex: string, alpha = 0.16): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function useNavigationTheme(): Theme {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      // Headers sit on the page background instead of a separate white bar.
      card: c.background,
      text: c.text,
      border: c.border,
    },
    fonts: {
      regular: { fontFamily: Font.regular, fontWeight: '400' },
      medium: { fontFamily: Font.semibold, fontWeight: '600' },
      bold: { fontFamily: Font.bold, fontWeight: '700' },
      heavy: { fontFamily: Font.heavy, fontWeight: '800' },
    },
  };
}

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const Radius = { sm: 10, md: 14, lg: 24, pill: 999 } as const;

/**
 * Nunito, a rounded, friendly sans. Custom fonts don't synthesize weights, so pick the family per weight
 * instead of setting `fontWeight`. Loaded in the root layout (`FONT_ASSETS`).
 */
export const Font = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  heavy: 'Nunito_800ExtraBold',
} as const;
export const MAX_CONTENT_WIDTH = 520;
export const MIN_TOUCH = 44;
