import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Font, useColors } from '@/constants/theme';

export default function TabLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: { fontFamily: Font.bold, fontSize: 12 },
        // Taller than the default 49pt so labels aren't clipped under the 28pt icon box on web.
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.border,
          borderTopWidth: 0,
          boxShadow: c.shadow,
          height: 60 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Log', tabBarIcon: ({ color }) => <Ionicons name="journal-outline" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="weight"
        options={{ title: 'Weight', tabBarIcon: ({ color }) => <Ionicons name="scale-outline" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings-outline" color={color} size={24} /> }}
      />
    </Tabs>
  );
}
