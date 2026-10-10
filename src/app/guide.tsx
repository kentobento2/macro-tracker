// Quick-start guide: one page a new user can open before signing in (send them the link), also linked from
// the Log screen's "Get started" checklist. ?section=install|assistant scrolls to that part.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/components/ui';
import { APP_URL, MCP_URL } from '@/constants/app';
import { Radius, Space, useColors } from '@/constants/theme';
import { useAuth } from '@/data/auth';

type IconName = ComponentProps<typeof Ionicons>['name'];

type SectionId = 'install' | 'targets' | 'log' | 'not-found' | 'weight' | 'assistant' | 'good-to-know';

function Section({
  icon,
  title,
  onLayoutY,
  children,
}: {
  icon: IconName;
  title: string;
  onLayoutY: (y: number) => void;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <View onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>
      <Card>
        <View style={styles.sectionHead}>
          <View style={[styles.iconWrap, { backgroundColor: c.primarySoft }]}>
            <Ionicons name={icon} size={20} color={c.primary} />
          </View>
          <AppText variant="heading" style={styles.flex}>
            {title}
          </AppText>
        </View>
        {children}
      </Card>
    </View>
  );
}

/** One numbered step. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.num, { backgroundColor: c.track }]}>
        <AppText variant="label">{n}</AppText>
      </View>
      <AppText style={styles.flex}>{children}</AppText>
    </View>
  );
}

/** A short tip below the steps. */
const Tip = ({ children }: { children: ReactNode }) => <AppText variant="small">{children}</AppText>;

/** UI words in bold, as they appear in the app. */
const B = ({ children }: { children: ReactNode }) => <Text style={styles.bold}>{children}</Text>;

// Real screens from the app with a demo account (regenerate with scripts/guide-screenshots.mjs).
const FEATURES: { image: number; title: string; caption: string }[] = [
  {
    image: require('../../assets/guide/log.webp'),
    title: 'Your day at a glance',
    caption: 'Calories, protein, fat and carbs against your targets, meal by meal.',
  },
  {
    image: require('../../assets/guide/add.webp'),
    title: 'Every way to add food',
    caption: 'Search USDA and Open Food Facts, scan a barcode, or pick your recipes, foods and favorites.',
  },
  {
    image: require('../../assets/guide/portion.webp'),
    title: 'See the impact first',
    caption: 'Servings, grams or ounces, and how much of each target it uses before you log it.',
  },
  {
    image: require('../../assets/guide/recipe-editor.webp'),
    title: 'Recipes you cook',
    caption: 'Enter the ingredients once. Totals for the batch and per serving are worked out for you.',
  },
  {
    image: require('../../assets/guide/recipe-log.webp'),
    title: 'Log exactly what you ate',
    caption: 'Weigh the pot, log your ounces, and see each ingredient’s share of your plate.',
  },
  {
    image: require('../../assets/guide/weight.webp'),
    title: 'Trends, not noise',
    caption: 'Your weekly average and 7-day trend line, so daily water swings don’t throw you off.',
  },
];

const SHOT_WIDTH = 220;
const SHOT_HEIGHT = Math.round((SHOT_WIDTH * 1688) / 780);

function FeatureGallery() {
  const c = useColors();
  return (
    <View style={styles.gallery}>
      <ScrollView
        horizontal
        snapToInterval={SHOT_WIDTH + Space.md}
        decelerationRate="fast"
        contentContainerStyle={styles.galleryRow}
        accessibilityLabel="What the app does">
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.tile}>
            <Image
              source={f.image}
              style={[styles.shot, { borderColor: c.border }]}
              accessibilityLabel={`${f.title}: ${f.caption}`}
              resizeMode="cover"
            />
            <AppText variant="label">{f.title}</AppText>
            <AppText variant="small">{f.caption}</AppText>
          </View>
        ))}
        <View style={styles.tile}>
          <ChatExample />
          <AppText variant="label">Or just say it</AppText>
          <AppText variant="small">
            Connect Claude and tell it what you ate. It finds the foods, shows you the numbers, and logs them when you
            say so.
          </AppText>
        </View>
      </ScrollView>
      <AppText variant="small" style={styles.center}>
        Swipe to see more →
      </AppText>
    </View>
  );
}

function Bubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: c.ink }
          : { alignSelf: 'flex-start', backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth },
      ]}>
      <AppText variant="small" style={{ color: mine ? c.onInk : c.text }}>
        {children}
      </AppText>
    </View>
  );
}

/** An example conversation with Claude, drawn in the app's style (numbers match the demo account's targets). */
function ChatExample() {
  const c = useColors();
  return (
    <View style={[styles.shot, styles.chat, { backgroundColor: c.background, borderColor: c.border }]}>
      <Bubble mine>I had 2 eggs and a slice of sourdough toast for breakfast</Bubble>
      <Bubble>
        Found them: 2 large eggs (148 kcal) and 1 slice sourdough toast (117 kcal). That’s 265 kcal, 17 g protein.
        Log it to breakfast?
      </Bubble>
      <Bubble mine>Yes</Bubble>
      <Bubble>Logged. You have 1,635 kcal and 123 g protein left today.</Bubble>
    </View>
  );
}

export default function GuideScreen() {
  const c = useColors();
  const { session } = useAuth();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  // Jump to the section the checklist asked for, once it has been laid out.
  const onSectionLayout = (id: SectionId, y: number) => {
    if (section === id && !scrolled.current) {
      scrolled.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - Space.xl), animated: false });
    }
  };

  return (
    <Screen edges={['top', 'bottom']} scrollRef={scrollRef}>
      <View style={styles.hero}>
        <Image source={require('../../public/icon-192.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        <AppText variant="title">Macro Tracker</AppText>
        <AppText variant="muted" style={styles.center}>
          Know what you eat without the busywork. Log meals in a few taps, cook your own recipes, track your weight,
          or just tell Claude what you had.
        </AppText>
      </View>

      <FeatureGallery />

      <AppText variant="heading" style={styles.center}>
        Get started in two minutes
      </AppText>

      <Section onLayoutY={(y) => onSectionLayout('install', y)} icon="phone-portrait-outline" title="1. Put it on your home screen">
        <AppText variant="label">iPhone (Safari)</AppText>
        <Step n={1}>Open {APP_URL.replace('https://', '')} in Safari.</Step>
        <Step n={2}>
          Tap the <B>Share</B> button, then <B>Add to Home Screen</B>.
        </Step>
        <AppText variant="label">Android (Chrome)</AppText>
        <Step n={1}>Open the link in Chrome.</Step>
        <Step n={2}>
          Tap the <B>⋮</B> menu, then <B>Add to Home screen</B> (or <B>Install app</B>).
        </Step>
        <Tip>Open it from the new icon and tap Continue with Google. It runs full screen and works offline.</Tip>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('targets', y)} icon="flag-outline" title="2. Set your targets">
        <Step n={1}>
          Go to <B>Settings</B> and fill in About you (units, age, weight, height, activity, goal).
        </Step>
        <Step n={2}>
          Tap <B>Use suggested targets</B>, then <B>Save</B>.
        </Step>
        <Tip>The suggestion is a starting point (Mifflin-St Jeor). You can type your own calories and macros any time.</Tip>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('log', y)} icon="restaurant-outline" title="3. Log a meal">
        <Step n={1}>
          On the Log screen, tap <B>+</B> on Breakfast, Lunch, Dinner or Snacks.
        </Step>
        <Step n={2}>
          Search, <B>Scan</B> a barcode, or pick from your favorites and recent foods.
        </Step>
        <Step n={3}>
          Set the amount in servings, grams or oz, then <B>Add to log</B>.
        </Step>
        <Tip>
          Tap a logged item to change it, copy it to today (Log today), or delete it. The heart saves a food with its
          usual portion.
        </Tip>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('not-found', y)} icon="create-outline" title="Not in the database?">
        <AppText>
          <B>Custom</B>: for anything with a label or menu. Enter the nutrition for one serving; the weight is optional
          and blank calories are worked out from the macros.
        </AppText>
        <AppText>
          <B>Recipe</B>: for dishes you cook. Add each ingredient as you weighed or measured it, then the number of
          servings and, ideally, the cooked weight (weigh the finished dish minus the pot). Then log a serving or the
          exact ounces you ate. Each time you cook it, update “This batch weighed”.
        </AppText>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('weight', y)} icon="scale-outline" title="Track your weight">
        <AppText>
          On the <B>Weight</B> tab, log one weigh-in a day. Watch the weekly average and the 7-day trend line rather
          than day-to-day swings, which are mostly water.
        </AppText>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('assistant', y)} icon="chatbubbles-outline" title="Log by chatting (optional)">
        <AppText variant="label">Claude</AppText>
        <Step n={1}>
          In Claude, open <B>Settings → Connectors → Add custom connector</B>.
        </Step>
        <Step n={2}>Name it Macro Tracker and paste this URL:</Step>
        <View style={[styles.code, { backgroundColor: c.track, borderColor: c.border }]}>
          <AppText selectable variant="label">
            {MCP_URL}
          </AppText>
        </View>
        <Step n={3}>
          Tap <B>Connect</B>, sign in with Google, and tap <B>Allow</B>.
        </Step>
        <Tip>
          Then just say what you ate: “2 eggs and toast for breakfast.” Claude shows what it found and asks before
          saving anything. Recipes and custom foods work too.
        </Tip>
        <AppText variant="label">Meta Muse</AppText>
        <AppText>
          In this app, go to <B>Settings → Assistant access → Create token</B>. Give Muse the URL above with Bearer
          authentication, and paste the token only into Muse’s secure prompt, never into the chat.
        </AppText>
      </Section>

      <Section onLayoutY={(y) => onSectionLayout('good-to-know', y)} icon="information-circle-outline" title="Good to know">
        <AppText>• Your log is private to your account.</AppText>
        <AppText>• It works offline and syncs when you’re back online.</AppText>
        <AppText>• See past days with the arrows, or tap the date for a calendar.</AppText>
        <AppText>
          • Nutrition comes from USDA FoodData Central and Open Food Facts (community data, so check it), and every
          number is calculated by the app, not guessed.
        </AppText>
      </Section>

      <Button
        title={session ? 'Back to the app' : 'Open the app'}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(session ? '/' : '/sign-in'))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.md },
  logo: { width: 72, height: 72, borderRadius: Radius.lg },
  center: { textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  step: { flexDirection: 'row', gap: Space.sm, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  bold: { fontWeight: '700' },
  gallery: { gap: Space.sm, marginHorizontal: -Space.lg },
  galleryRow: { gap: Space.md, paddingHorizontal: Space.lg },
  tile: { width: SHOT_WIDTH, gap: Space.xs },
  shot: { width: SHOT_WIDTH, height: SHOT_HEIGHT, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: Space.xs },
  chat: { padding: Space.sm, gap: Space.sm, justifyContent: 'center' },
  bubble: { maxWidth: '88%', borderRadius: Radius.md, paddingHorizontal: Space.sm, paddingVertical: Space.xs + 2 },
  code: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.sm, padding: Space.sm },
});
