import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

const light = {
  background: '#F5F7F6',
  card: '#FFFFFF',
  text: '#0F1A16',
  muted: '#5E6B66',
  border: '#E1E7E4',
  track: '#E6ECE9',
  primary: '#0E8F63',
  onPrimary: '#FFFFFF',
  primarySoft: '#E3F4EC',
  danger: '#C62828',
  warning: '#9A6200',
  warningSoft: '#FFF4DB',
  protein: '#2F6FEB',
  carbs: '#D98200',
  fat: '#D6407E',
};

const dark: typeof light = {
  background: '#0C1210',
  card: '#151D1A',
  text: '#E8EFEC',
  muted: '#93A29C',
  border: '#24302B',
  track: '#24302B',
  primary: '#3DD39A',
  onPrimary: '#042A1B',
  primarySoft: '#123327',
  danger: '#FF7A7A',
  warning: '#F2C14E',
  warningSoft: '#2E2610',
  protein: '#6EA0FF',
  carbs: '#F5B041',
  fat: '#F27AAE',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
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
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const MAX_CONTENT_WIDTH = 520;
export const MIN_TOUCH = 44;
