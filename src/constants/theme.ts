import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

// One color per nutrient, used on every screen (numbers, pills, rings, bars, chart).
const light = {
  background: '#F2F3F5',
  card: '#FFFFFF',
  text: '#111418',
  muted: '#6B7280',
  border: '#E6E8EC',
  track: '#ECEEF1',
  // Accent for progress, selection and links.
  primary: '#0E8F63',
  onPrimary: '#FFFFFF',
  primarySoft: '#E3F4EC',
  // Dark primary action button and selected pills.
  ink: '#111418',
  onInk: '#FFFFFF',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
  warning: '#8A5A00',
  warningSoft: '#FFF4DB',
  calories: '#0E8F63',
  protein: '#2F6FEB',
  carbs: '#D98200',
  fat: '#D6407E',
};

const dark: typeof light = {
  background: '#0C0F12',
  card: '#171B20',
  text: '#ECEFF3',
  muted: '#9AA3AE',
  border: '#262C33',
  track: '#262C33',
  primary: '#3DD39A',
  onPrimary: '#042A1B',
  primarySoft: '#13322A',
  ink: '#ECEFF3',
  onInk: '#0C0F12',
  danger: '#FF7A7A',
  dangerSoft: '#3A1D1D',
  warning: '#F2C14E',
  warningSoft: '#2E2610',
  calories: '#3DD39A',
  protein: '#6EA0FF',
  carbs: '#F5B041',
  fat: '#F27AAE',
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
      card: c.card,
      text: c.text,
      border: c.border,
    },
  };
}

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const Radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
export const MAX_CONTENT_WIDTH = 520;
export const MIN_TOUCH = 44;
